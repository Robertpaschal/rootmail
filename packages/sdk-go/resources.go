package rootmail

import (
	"context"
	"net/url"
	"strconv"
)

// Object is a decoded JSON object with the API's snake_case field names. Methods
// that return varied shapes hand back an Object; decode into your own struct if you
// prefer static types.
type Object = map[string]any

// List is the standard list envelope.
type List struct {
	Object string   `json:"object"`
	Data   []Object `json:"data"`
}

// Message is the flagship object returned by send/get.
type Message struct {
	ID        string `json:"id"`
	Object    string `json:"object"`
	To        string `json:"to"`
	Subject   string `json:"subject"`
	Status    string `json:"status"`
	Type      string `json:"type"`
	CreatedAt string `json:"created_at"`
}

func intQuery(name string, v int) url.Values {
	q := url.Values{}
	if v > 0 {
		q.Set(name, strconv.Itoa(v))
	}
	return q
}

// --- Messages ---------------------------------------------------------------

type MessagesService struct{ c *Client }

// SendParams is the payload for Messages.Send. Provide HTML/Text or a Template slug
// plus Variables. IdempotencyKey is optional (one is generated if empty).
type SendParams struct {
	To             string         `json:"to"`
	Subject        string         `json:"subject,omitempty"`
	HTML           string         `json:"html,omitempty"`
	Text           string         `json:"text,omitempty"`
	Template       string         `json:"template,omitempty"`
	Variables      map[string]any `json:"variables,omitempty"`
	FromEmail      string         `json:"from_email,omitempty"`
	IdempotencyKey string         `json:"-"`
}

func (s *MessagesService) Send(ctx context.Context, p SendParams) (*Message, error) {
	key := p.IdempotencyKey
	if key == "" {
		key = newIdempotencyKey()
	}
	var out Message
	err := s.c.do(ctx, "POST", "/v1/messages", requestOptions{body: p, idempotencyKey: key}, &out)
	return &out, err
}

func (s *MessagesService) Get(ctx context.Context, id string) (*Message, error) {
	var out Message
	err := s.c.do(ctx, "GET", "/v1/messages/"+id, requestOptions{}, &out)
	return &out, err
}

// List returns recent messages. limit ≤ 100; status is optional (e.g. "bounced").
func (s *MessagesService) List(ctx context.Context, limit int, status string) (*List, error) {
	q := intQuery("limit", limit)
	if status != "" {
		q.Set("status", status)
	}
	var out List
	err := s.c.do(ctx, "GET", "/v1/messages", requestOptions{query: q}, &out)
	return &out, err
}

func (s *MessagesService) Audit(ctx context.Context, id string) (Object, error) {
	var out Object
	err := s.c.do(ctx, "GET", "/v1/messages/"+id+"/audit", requestOptions{}, &out)
	return out, err
}

// --- Templates --------------------------------------------------------------

type TemplatesService struct{ c *Client }

func (s *TemplatesService) List(ctx context.Context) (*List, error) {
	var out List
	err := s.c.do(ctx, "GET", "/v1/templates", requestOptions{}, &out)
	return &out, err
}
func (s *TemplatesService) Get(ctx context.Context, id string) (Object, error) {
	return object(s.c, ctx, "GET", "/v1/templates/"+id, nil)
}
func (s *TemplatesService) Create(ctx context.Context, body Object) (Object, error) {
	return object(s.c, ctx, "POST", "/v1/templates", body)
}
func (s *TemplatesService) Update(ctx context.Context, id string, body Object) (Object, error) {
	return object(s.c, ctx, "PATCH", "/v1/templates/"+id, body)
}
func (s *TemplatesService) Delete(ctx context.Context, id string) error {
	return s.c.do(ctx, "DELETE", "/v1/templates/"+id, requestOptions{}, nil)
}

// --- Contacts ---------------------------------------------------------------

type ContactsService struct{ c *Client }

func (s *ContactsService) Create(ctx context.Context, body Object) (Object, error) {
	return object(s.c, ctx, "POST", "/v1/contacts", body)
}
func (s *ContactsService) Delete(ctx context.Context, email string) error {
	return s.c.do(ctx, "DELETE", "/v1/contacts/"+url.PathEscape(email), requestOptions{}, nil)
}

// --- Lists ------------------------------------------------------------------

type ListsService struct{ c *Client }

func (s *ListsService) List(ctx context.Context) (*List, error) {
	var out List
	err := s.c.do(ctx, "GET", "/v1/lists", requestOptions{}, &out)
	return &out, err
}
func (s *ListsService) Get(ctx context.Context, id string) (Object, error) {
	return object(s.c, ctx, "GET", "/v1/lists/"+id, nil)
}
func (s *ListsService) Create(ctx context.Context, name, description string) (Object, error) {
	return object(s.c, ctx, "POST", "/v1/lists", Object{"name": name, "description": description})
}
func (s *ListsService) Delete(ctx context.Context, id string) error {
	return s.c.do(ctx, "DELETE", "/v1/lists/"+id, requestOptions{}, nil)
}
func (s *ListsService) Contacts(ctx context.Context, id string) (*List, error) {
	var out List
	err := s.c.do(ctx, "GET", "/v1/lists/"+id+"/contacts", requestOptions{}, &out)
	return &out, err
}
func (s *ListsService) AddContact(ctx context.Context, id, email string) (Object, error) {
	return object(s.c, ctx, "POST", "/v1/lists/"+id+"/contacts", Object{"email": email})
}

// --- Campaigns --------------------------------------------------------------

type CampaignsService struct{ c *Client }

func (s *CampaignsService) List(ctx context.Context) (*List, error) {
	var out List
	err := s.c.do(ctx, "GET", "/v1/campaigns", requestOptions{}, &out)
	return &out, err
}
func (s *CampaignsService) Get(ctx context.Context, id string) (Object, error) {
	return object(s.c, ctx, "GET", "/v1/campaigns/"+id, nil)
}
func (s *CampaignsService) Create(ctx context.Context, body Object) (Object, error) {
	return object(s.c, ctx, "POST", "/v1/campaigns", body)
}
func (s *CampaignsService) Send(ctx context.Context, id string) (Object, error) {
	return object(s.c, ctx, "POST", "/v1/campaigns/"+id+"/send", Object{})
}
func (s *CampaignsService) Delete(ctx context.Context, id string) error {
	return s.c.do(ctx, "DELETE", "/v1/campaigns/"+id, requestOptions{}, nil)
}

// Analytics returns the campaign's sent → delivered → opened → clicked funnel.
func (s *CampaignsService) Analytics(ctx context.Context, id string) (Object, error) {
	return object(s.c, ctx, "GET", "/v1/campaigns/"+id+"/analytics", nil)
}

// --- Sequences --------------------------------------------------------------

type SequencesService struct{ c *Client }

func (s *SequencesService) List(ctx context.Context) (*List, error) {
	var out List
	err := s.c.do(ctx, "GET", "/v1/sequences", requestOptions{}, &out)
	return &out, err
}
func (s *SequencesService) Get(ctx context.Context, id string) (Object, error) {
	return object(s.c, ctx, "GET", "/v1/sequences/"+id, nil)
}
func (s *SequencesService) Create(ctx context.Context, body Object) (Object, error) {
	return object(s.c, ctx, "POST", "/v1/sequences", body)
}
func (s *SequencesService) Enroll(ctx context.Context, id, email string) (Object, error) {
	return object(s.c, ctx, "POST", "/v1/sequences/"+id+"/enroll", Object{"email": email})
}
func (s *SequencesService) Enrollments(ctx context.Context, id string) (*List, error) {
	var out List
	err := s.c.do(ctx, "GET", "/v1/sequences/"+id+"/enrollments", requestOptions{}, &out)
	return &out, err
}

// Analytics returns the sequence funnel plus per-step drop-off.
func (s *SequencesService) Analytics(ctx context.Context, id string) (Object, error) {
	return object(s.c, ctx, "GET", "/v1/sequences/"+id+"/analytics", nil)
}

// --- Suppressions -----------------------------------------------------------

type SuppressionsService struct{ c *Client }

func (s *SuppressionsService) List(ctx context.Context) (*List, error) {
	var out List
	err := s.c.do(ctx, "GET", "/v1/suppressions", requestOptions{}, &out)
	return &out, err
}
func (s *SuppressionsService) Add(ctx context.Context, email, reason string) (Object, error) {
	return object(s.c, ctx, "POST", "/v1/suppressions", Object{"email": email, "reason": reason})
}
func (s *SuppressionsService) Check(ctx context.Context, email string) (Object, error) {
	q := url.Values{}
	q.Set("email", email)
	var out Object
	err := s.c.do(ctx, "GET", "/v1/suppressions/check", requestOptions{query: q}, &out)
	return out, err
}

// --- Sub-tenants ------------------------------------------------------------

type SubTenantsService struct{ c *Client }

func (s *SubTenantsService) List(ctx context.Context) (*List, error) {
	var out List
	err := s.c.do(ctx, "GET", "/v1/sub-tenants", requestOptions{}, &out)
	return &out, err
}
func (s *SubTenantsService) Get(ctx context.Context, id string) (Object, error) {
	return object(s.c, ctx, "GET", "/v1/sub-tenants/"+id, nil)
}
func (s *SubTenantsService) Create(ctx context.Context, body Object) (Object, error) {
	return object(s.c, ctx, "POST", "/v1/sub-tenants", body)
}

// Auth returns SPF/DKIM/DMARC/BIMI posture and the DNS records to publish.
func (s *SubTenantsService) Auth(ctx context.Context, id string) (Object, error) {
	return object(s.c, ctx, "GET", "/v1/sub-tenants/"+id+"/auth", nil)
}

// --- Insights ---------------------------------------------------------------

type AnalyticsService struct{ c *Client }

func (s *AnalyticsService) Get(ctx context.Context, windowDays int) (Object, error) {
	var out Object
	err := s.c.do(ctx, "GET", "/v1/analytics", requestOptions{query: intQuery("window_days", windowDays)}, &out)
	return out, err
}

type DeliverabilityService struct{ c *Client }

func (s *DeliverabilityService) Get(ctx context.Context, windowDays int) (Object, error) {
	var out Object
	err := s.c.do(ctx, "GET", "/v1/deliverability", requestOptions{query: intQuery("window_days", windowDays)}, &out)
	return out, err
}

// --- Imports ----------------------------------------------------------------

type ImportsService struct{ c *Client }

func (s *ImportsService) Contacts(ctx context.Context, entries []Object, listID string) (Object, error) {
	body := Object{"entries": entries}
	if listID != "" {
		body["list_id"] = listID
	}
	return object(s.c, ctx, "POST", "/v1/imports/contacts", body)
}
func (s *ImportsService) Suppressions(ctx context.Context, entries []Object, source string) (Object, error) {
	body := Object{"entries": entries}
	if source != "" {
		body["source"] = source
	}
	return object(s.c, ctx, "POST", "/v1/imports/suppressions", body)
}

// --- Assistant --------------------------------------------------------------

type AssistantService struct{ c *Client }

// Chat asks the agentic assistant to build, operate, or diagnose your email.
func (s *AssistantService) Chat(ctx context.Context, prompt string) (Object, error) {
	return object(s.c, ctx, "POST", "/v1/assistant", Object{"prompt": prompt})
}

// object is a small helper for endpoints that return a single JSON object.
func object(c *Client, ctx context.Context, method, path string, body any) (Object, error) {
	var out Object
	opts := requestOptions{}
	if body != nil {
		opts.body = body
	}
	err := c.do(ctx, method, path, opts, &out)
	return out, err
}
