import { redirect } from "next/navigation";

/** Hidden this week: the signed-out loop bounced here back to /login, and we do not send mail. */
export default function ForgotPasswordPage() {
  redirect("/login");
}
