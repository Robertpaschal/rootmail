#!/usr/bin/env bash
#
# One-shot AWS build-out for rootmail.io production (alpha sizing).
#
# Creates, in order: VPC → subnets → gateway/routes → security groups →
# RDS Postgres → ElastiCache Redis → three EC2 hosts with Elastic IPs.
# Everything is tagged Project=rootmail so you can find (and delete) it all.
#
# THIS CREATES BILLABLE RESOURCES (~$110/month). It prints a plan and waits
# for you to type "yes" before the first API call that costs money.
#
# Run it phase by phase if you'd rather go slowly:
#     ./scripts/provision-rootmail-io.sh network     # free, safe to run first
#     ./scripts/provision-rootmail-io.sh data        # RDS + Redis (~12 min)
#     ./scripts/provision-rootmail-io.sh compute     # EC2 + EIPs
#     ./scripts/provision-rootmail-io.sh outputs     # print what to hand back
#     ./scripts/provision-rootmail-io.sh all         # everything, in order
#
# Prerequisites:
#   - aws CLI v2, authenticated against the account you want prod to live in
#     (check with: aws sts get-caller-identity)
#   - an EC2 key pair whose .pem you hold locally (see KEY_NAME below)
#
set -euo pipefail

# ─────────────────────────────────────────────────────────────── settings ──
REGION="${REGION:-us-east-1}"
AZ_A="${AZ_A:-${REGION}a}"
AZ_B="${AZ_B:-${REGION}b}"
PROJECT="rootmail"
KEY_NAME="${KEY_NAME:-rootmail-prod}"

VPC_CIDR="10.0.0.0/16"
PUB_A_CIDR="10.0.1.0/24"
PUB_B_CIDR="10.0.2.0/24"
PRI_A_CIDR="10.0.11.0/24"
PRI_B_CIDR="10.0.12.0/24"

APP_INSTANCE_TYPE="${APP_INSTANCE_TYPE:-t3.small}"
APP_DISK_GB="${APP_DISK_GB:-30}"

DB_INSTANCE_CLASS="${DB_INSTANCE_CLASS:-db.t4g.small}"
DB_STORAGE_GB="${DB_STORAGE_GB:-20}"
DB_ENGINE_VERSION="${DB_ENGINE_VERSION:-18.3}"   # matches what prod runs today
DB_NAME="rootmail"
DB_USER="rootmail"

CACHE_NODE_TYPE="${CACHE_NODE_TYPE:-cache.t4g.micro}"
CACHE_FAMILY="${CACHE_FAMILY:-redis7}"

# Your own IP, for SSH. Detected if not set. SSH is NEVER opened to 0.0.0.0/0.
MY_IP="${MY_IP:-$(curl -s https://checkip.amazonaws.com || true)}"

STATE_FILE="${STATE_FILE:-$HOME/.rootmail-prod-ids}"

# ──────────────────────────────────────────────────────────────── helpers ──
aws() { command aws --region "$REGION" "$@"; }
say() { printf '\033[36m▸\033[0m %s\n' "$*"; }
ok()  { printf '\033[32m✓\033[0m %s\n' "$*"; }
die() { printf '\033[31m✗\033[0m %s\n' "$*" >&2; exit 1; }

# Remember every id we create so re-runs and later phases can find them.
save() { touch "$STATE_FILE"; sed -i.bak "/^$1=/d" "$STATE_FILE" 2>/dev/null || true
         echo "$1=$2" >> "$STATE_FILE"; rm -f "$STATE_FILE.bak"; export "$1=$2"; }
load() { [[ -f "$STATE_FILE" ]] && set -a && . "$STATE_FILE" && set +a || true; }

tag() { aws ec2 create-tags --resources "$1" \
          --tags "Key=Name,Value=$2" "Key=Project,Value=$PROJECT" >/dev/null; }

# macOS ships bash 3.2, where ${var^^} is a syntax error. Use tr.
upper() { echo "$1" | tr '[:lower:]' '[:upper:]'; }

# ───────────────────────────────────────────────────────────── preflight ──
preflight() {
  command -v aws >/dev/null || die "aws CLI not found"
  local who; who=$(aws sts get-caller-identity --query 'Account' --output text) \
    || die "aws CLI is not authenticated"
  [[ -n "$MY_IP" ]] || die "could not detect your public IP; set MY_IP=1.2.3.4"

  aws ec2 describe-key-pairs --key-names "$KEY_NAME" >/dev/null 2>&1 || die \
    "key pair '$KEY_NAME' does not exist in $REGION.
     Create it and keep the private key:
       aws ec2 create-key-pair --region $REGION --key-name $KEY_NAME \\
         --query KeyMaterial --output text > ~/.ssh/$KEY_NAME.pem
       chmod 400 ~/.ssh/$KEY_NAME.pem"

  cat <<EOF

  ┌─ rootmail.io production build-out ────────────────────────────
  │  AWS account   $who
  │  Region        $REGION   (AZs: $AZ_A, $AZ_B)
  │  SSH allowed   $MY_IP/32 only
  │  Key pair      $KEY_NAME
  │
  │  3 × $APP_INSTANCE_TYPE + ${APP_DISK_GB}GiB gp3      web · api · worker
  │  1 × $DB_INSTANCE_CLASS + ${DB_STORAGE_GB}GiB    Postgres $DB_ENGINE_VERSION
  │  1 × $CACHE_NODE_TYPE            Redis, noeviction
  │  3 × Elastic IP
  │
  │  Roughly \$110/month.
  └───────────────────────────────────────────────────────────────

EOF
  read -r -p "Type 'yes' to create these resources: " confirm
  [[ "$confirm" == "yes" ]] || die "aborted — nothing was created"
}

# ─────────────────────────────────────────────────────────────── network ──
phase_network() {
  load
  say "VPC"
  VPC_ID=$(aws ec2 create-vpc --cidr-block "$VPC_CIDR" \
    --query 'Vpc.VpcId' --output text); save VPC_ID "$VPC_ID"; tag "$VPC_ID" "$PROJECT-vpc"
  aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-hostnames >/dev/null
  aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-support >/dev/null
  ok "VPC $VPC_ID"

  say "Subnets"
  for spec in "PUB_A:$PUB_A_CIDR:$AZ_A:public-a" "PUB_B:$PUB_B_CIDR:$AZ_B:public-b" \
              "PRI_A:$PRI_A_CIDR:$AZ_A:private-a" "PRI_B:$PRI_B_CIDR:$AZ_B:private-b"; do
    IFS=: read -r var cidr az name <<< "$spec"
    id=$(aws ec2 create-subnet --vpc-id "$VPC_ID" --cidr-block "$cidr" \
      --availability-zone "$az" --query 'Subnet.SubnetId' --output text)
    tag "$id" "$PROJECT-$name"; save "${var}_ID" "$id"
    # Public subnets hand out public IPs; private ones deliberately do not.
    [[ $var == PUB_* ]] && aws ec2 modify-subnet-attribute --subnet-id "$id" \
      --map-public-ip-on-launch >/dev/null
    ok "$name  $id  $cidr  $az"
  done

  say "Internet gateway + public route"
  IGW_ID=$(aws ec2 create-internet-gateway \
    --query 'InternetGateway.InternetGatewayId' --output text)
  save IGW_ID "$IGW_ID"; tag "$IGW_ID" "$PROJECT-igw"
  aws ec2 attach-internet-gateway --vpc-id "$VPC_ID" --internet-gateway-id "$IGW_ID"
  RT_ID=$(aws ec2 create-route-table --vpc-id "$VPC_ID" \
    --query 'RouteTable.RouteTableId' --output text)
  save RT_ID "$RT_ID"; tag "$RT_ID" "$PROJECT-public-rt"
  aws ec2 create-route --route-table-id "$RT_ID" \
    --destination-cidr-block 0.0.0.0/0 --gateway-id "$IGW_ID" >/dev/null
  aws ec2 associate-route-table --route-table-id "$RT_ID" --subnet-id "$PUB_A_ID" >/dev/null
  aws ec2 associate-route-table --route-table-id "$RT_ID" --subnet-id "$PUB_B_ID" >/dev/null
  ok "IGW $IGW_ID — private subnets have NO route out (deliberate: no NAT gateway)"

  say "Security groups"
  mk_sg() { local n=$1 d=$2; local id
    id=$(aws ec2 create-security-group --group-name "$PROJECT-$n" \
      --description "$d" --vpc-id "$VPC_ID" --query 'GroupId' --output text)
    tag "$id" "$PROJECT-$n"; echo "$id"; }
  SG_WEB=$(mk_sg web  "public HTTP/HTTPS + admin SSH");   save SG_WEB "$SG_WEB"
  SG_API=$(mk_sg api  "API, reachable from web tier");     save SG_API "$SG_API"
  SG_WRK=$(mk_sg worker "worker, no inbound traffic");     save SG_WRK "$SG_WRK"
  SG_DATA=$(mk_sg data "Postgres + Redis, VPC-only");      save SG_DATA "$SG_DATA"

  # Public edge.
  aws ec2 authorize-security-group-ingress --group-id "$SG_WEB" \
    --protocol tcp --port 80  --cidr 0.0.0.0/0 >/dev/null
  aws ec2 authorize-security-group-ingress --group-id "$SG_WEB" \
    --protocol tcp --port 443 --cidr 0.0.0.0/0 >/dev/null
  # SSH: your address only, on every tier.
  for sg in "$SG_WEB" "$SG_API" "$SG_WRK"; do
    aws ec2 authorize-security-group-ingress --group-id "$sg" \
      --protocol tcp --port 22 --cidr "${MY_IP}/32" >/dev/null
  done
  # API is reachable only from the web tier, never the internet.
  aws ec2 authorize-security-group-ingress --group-id "$SG_API" \
    --protocol tcp --port 4000 --source-group "$SG_WEB" >/dev/null
  # Data tier answers only to api + worker. This is the rule that keeps
  # Postgres and Redis off the public internet no matter what else changes.
  for port in 5432 6379; do
    aws ec2 authorize-security-group-ingress --group-id "$SG_DATA" \
      --protocol tcp --port "$port" --source-group "$SG_API" >/dev/null
    aws ec2 authorize-security-group-ingress --group-id "$SG_DATA" \
      --protocol tcp --port "$port" --source-group "$SG_WRK" >/dev/null
  done
  ok "web $SG_WEB · api $SG_API · worker $SG_WRK · data $SG_DATA"
}

# ────────────────────────────────────────────────────────── data services ──
phase_data() {
  load
  [[ -n "${VPC_ID:-}" ]] || die "run the 'network' phase first"

  say "RDS subnet group (private subnets only)"
  aws rds create-db-subnet-group \
    --db-subnet-group-name "$PROJECT-db" \
    --db-subnet-group-description "rootmail private subnets" \
    --subnet-ids "$PRI_A_ID" "$PRI_B_ID" \
    --tags "Key=Project,Value=$PROJECT" >/dev/null
  ok "db subnet group spans $AZ_A + $AZ_B (required even for single-AZ)"

  say "Postgres $DB_ENGINE_VERSION — $DB_INSTANCE_CLASS"
  # --manage-master-user-password stores the password in Secrets Manager so it
  # never lands in your shell history. Rotation gets DISABLED right after: it
  # silently broke prod once, because the app reads DATABASE_URL at boot and
  # never re-reads it.
  aws rds create-db-instance \
    --db-instance-identifier "$PROJECT-prod" \
    --db-instance-class "$DB_INSTANCE_CLASS" \
    --engine postgres --engine-version "$DB_ENGINE_VERSION" \
    --allocated-storage "$DB_STORAGE_GB" --storage-type gp3 --storage-encrypted \
    --max-allocated-storage 100 \
    --db-name "$DB_NAME" --master-username "$DB_USER" \
    --manage-master-user-password \
    --db-subnet-group-name "$PROJECT-db" \
    --vpc-security-group-ids "$SG_DATA" \
    --backup-retention-period 7 \
    --no-publicly-accessible --no-multi-az \
    --auto-minor-version-upgrade \
    --tags "Key=Project,Value=$PROJECT" >/dev/null
  ok "creating (takes ~10 minutes; we'll wait at the end)"

  say "Redis parameter group — noeviction"
  aws elasticache create-cache-parameter-group \
    --cache-parameter-group-name "$PROJECT-redis" \
    --cache-parameter-group-family "$CACHE_FAMILY" \
    --description "rootmail: queue state must never be evicted" >/dev/null
  # THE important setting. BullMQ keeps in-flight jobs in Redis; the default
  # volatile-lru lets Redis delete accepted-but-unsent email under pressure.
  aws elasticache modify-cache-parameter-group \
    --cache-parameter-group-name "$PROJECT-redis" \
    --parameter-name-values "ParameterName=maxmemory-policy,ParameterValue=noeviction" >/dev/null
  ok "maxmemory-policy = noeviction"

  aws elasticache create-cache-subnet-group \
    --cache-subnet-group-name "$PROJECT-cache" \
    --cache-subnet-group-description "rootmail private subnets" \
    --subnet-ids "$PRI_A_ID" "$PRI_B_ID" >/dev/null

  say "Redis — $CACHE_NODE_TYPE"
  aws elasticache create-cache-cluster \
    --cache-cluster-id "$PROJECT-redis" \
    --engine redis --cache-node-type "$CACHE_NODE_TYPE" --num-cache-nodes 1 \
    --cache-parameter-group-name "$PROJECT-redis" \
    --cache-subnet-group-name "$PROJECT-cache" \
    --security-group-ids "$SG_DATA" \
    --snapshot-retention-limit 5 \
    --tags "Key=Project,Value=$PROJECT" >/dev/null
  ok "creating"

  say "waiting for Postgres (~10 min) …"
  aws rds wait db-instance-available --db-instance-identifier "$PROJECT-prod"
  DB_HOST=$(aws rds describe-db-instances --db-instance-identifier "$PROJECT-prod" \
    --query 'DBInstances[0].Endpoint.Address' --output text); save DB_HOST "$DB_HOST"
  DB_SECRET=$(aws rds describe-db-instances --db-instance-identifier "$PROJECT-prod" \
    --query 'DBInstances[0].MasterUserSecret.SecretArn' --output text); save DB_SECRET "$DB_SECRET"

  # Turn rotation off — see the note above.
  aws secretsmanager cancel-rotate-secret --secret-id "$DB_SECRET" >/dev/null 2>&1 \
    && ok "automatic password rotation disabled" \
    || say "note: could not disable rotation automatically — do it in the console"

  say "waiting for Redis …"
  aws elasticache wait cache-cluster-available --cache-cluster-id "$PROJECT-redis"
  REDIS_HOST=$(aws elasticache describe-cache-clusters --cache-cluster-id "$PROJECT-redis" \
    --show-cache-node-info --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' \
    --output text); save REDIS_HOST "$REDIS_HOST"
  ok "Postgres $DB_HOST · Redis $REDIS_HOST"
}

# ─────────────────────────────────────────────────────────────── compute ──
phase_compute() {
  load
  [[ -n "${VPC_ID:-}" ]] || die "run the 'network' phase first"

  say "Ubuntu 24.04 AMI (x86 — CI builds linux/amd64 only)"
  AMI=$(aws ssm get-parameters --names \
    /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id \
    --query 'Parameters[0].Value' --output text); ok "$AMI"

  # Docker + compose, a journal cap so a full disk can never spin the CPU
  # again, and nothing else. Config comes later, from the deploy step.
  local userdata; userdata=$(base64 <<'CLOUDINIT'
#!/bin/bash
set -e
apt-get update
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
usermod -aG docker ubuntu
printf 'SystemMaxUse=200M\n' >> /etc/systemd/journald.conf
systemctl restart systemd-journald
printf '{"log-driver":"json-file","log-opts":{"max-size":"20m","max-file":"3"}}\n' > /etc/docker/daemon.json
systemctl restart docker
CLOUDINIT
)

  for spec in "web:$SG_WEB" "api:$SG_API" "worker:$SG_WRK"; do
    IFS=: read -r name sg <<< "$spec"
    say "EC2 $name — $APP_INSTANCE_TYPE, ${APP_DISK_GB}GiB"
    # web goes in AZ a, api in a, worker in b — spread so one AZ event
    # doesn't take literally everything, without paying for redundancy.
    local subnet="$PUB_A_ID"; [[ $name == worker ]] && subnet="$PUB_B_ID"
    id=$(aws ec2 run-instances --image-id "$AMI" --instance-type "$APP_INSTANCE_TYPE" \
      --key-name "$KEY_NAME" --subnet-id "$subnet" --security-group-ids "$sg" \
      --user-data "$userdata" \
      --block-device-mappings "DeviceName=/dev/sda1,Ebs={VolumeSize=$APP_DISK_GB,VolumeType=gp3,Encrypted=true,DeleteOnTermination=true}" \
      --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$PROJECT-$name},{Key=Project,Value=$PROJECT}]" \
      --metadata-options "HttpTokens=required" \
      --query 'Instances[0].InstanceId' --output text)
    save "INST_$(upper "$name")" "$id"; ok "$name $id"
  done

  say "waiting for instances …"
  aws ec2 wait instance-running --instance-ids "$INST_WEB" "$INST_API" "$INST_WORKER"

  say "Elastic IPs"
  for spec in "web:$INST_WEB" "api:$INST_API" "worker:$INST_WORKER"; do
    IFS=: read -r name inst <<< "$spec"
    alloc=$(aws ec2 allocate-address --domain vpc \
      --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=$PROJECT-$name},{Key=Project,Value=$PROJECT}]" \
      --query 'AllocationId' --output text)
    aws ec2 associate-address --instance-id "$inst" --allocation-id "$alloc" >/dev/null
    ip=$(aws ec2 describe-addresses --allocation-ids "$alloc" \
      --query 'Addresses[0].PublicIp' --output text)
    save "IP_$(upper "$name")" "$ip"; ok "$name → $ip"
  done
}

# ─────────────────────────────────────────────────────────────── outputs ──
phase_outputs() {
  load
  cat <<EOF

  ┌─ hand these back ─────────────────────────────────────────────
  │
  │  web host      ${IP_WEB:-?}
  │  api host      ${IP_API:-?}
  │  worker host   ${IP_WORKER:-?}
  │
  │  postgres      ${DB_HOST:-?}
  │  redis         ${REDIS_HOST:-?}
  │
  │  ssh key       ~/.ssh/$KEY_NAME.pem
  │  db secret     ${DB_SECRET:-?}
  │
  └───────────────────────────────────────────────────────────────

  The database password lives in Secrets Manager and is NOT printed here.
  It gets read once, on the host, when the .env.prod files are written.

  Everything above is also saved in $STATE_FILE

  Check you can reach the hosts:
    ssh -i ~/.ssh/$KEY_NAME.pem ubuntu@${IP_API:-?} 'docker --version'

EOF
}

# ────────────────────────────────────────────────────────────────── main ──
case "${1:-all}" in
  network) preflight; phase_network ;;
  data)    phase_data ;;
  compute) phase_compute; phase_outputs ;;
  outputs) phase_outputs ;;
  all)     preflight; phase_network; phase_data; phase_compute; phase_outputs ;;
  *) die "usage: $0 [network|data|compute|outputs|all]" ;;
esac
