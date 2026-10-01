type AuthErrorLike = {
  code?: string;
  message?: string;
  status?: number;
  name?: string;
};

/** Turns a Supabase Auth error into a short sentence for the user (phase-03 3.1). */
export function describeAuthError(error: AuthErrorLike | null | undefined): string {
  if (!error) return "Something went wrong. Please try again.";
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();

  if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
    return "Wrong email or password.";
  }
  if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
    return "Please confirm your email first, then sign in.";
  }
  if (
    code === "user_already_exists" ||
    code === "email_exists" ||
    message.includes("already registered")
  ) {
    return "An account with this email already exists. Sign in instead.";
  }
  if (code === "weak_password" || message.includes("password should be")) {
    return "Use a password with at least 6 characters.";
  }
  if (code === "email_address_invalid" || message.includes("invalid email")) {
    return "Enter a valid email address.";
  }
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit" || error.status === 429) {
    return "Too many tries. Please wait a minute and try again.";
  }
  if (error.name === "AuthRetryableFetchError" || message.includes("failed to fetch")) {
    return "Can't reach the server. Check your connection and try again.";
  }
  return "Something went wrong. Please try again.";
}
