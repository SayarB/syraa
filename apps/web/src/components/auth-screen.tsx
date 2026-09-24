import { type FormEvent, type ReactNode, useId } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

/** Full-screen centred shell used by the loading and sign-in states. */
export function AuthShell({ toolbar, children }: { toolbar: ReactNode; children: ReactNode }) {
  return (
    <div className="relative grid min-h-full place-items-center bg-sidebar p-4">
      <div className="absolute top-3 right-3">{toolbar}</div>
      {children}
    </div>
  );
}

type SignInProps = {
  googleEnabled: boolean;
  email: string;
  onEmailChange: (email: string) => void;
  busy: boolean;
  sent: boolean;
  error: string | null;
  onGoogle: () => void;
  onMagicLink: (event: FormEvent) => void;
  onUseDifferentEmail: () => void;
};

export function SignInCard(props: SignInProps) {
  const emailId = useId();

  return (
    <Card className="w-full max-w-sm rounded-2xl border-0 shadow-soft">
      <CardHeader className="items-center text-center">
        <span className="mx-auto mb-2 grid size-10 place-items-center rounded-xl bg-primary font-semibold text-primary-foreground">
          S
        </span>
        <CardTitle className="text-xl">Welcome back</CardTitle>
        <CardDescription>Sign in to continue your chats and memory.</CardDescription>
      </CardHeader>

      <CardContent className="grid gap-4">
        {props.googleEnabled ? (
          <>
            <Button
              variant="outline"
              className="h-10 w-full"
              onClick={props.onGoogle}
              disabled={props.busy}
            >
              Continue with Google
            </Button>
            <div className="flex items-center gap-3 text-muted-foreground text-xs">
              <Separator className="flex-1" />
              or
              <Separator className="flex-1" />
            </div>
          </>
        ) : null}

        {props.sent ? (
          <p className="text-center text-muted-foreground text-sm">
            Check <strong className="text-foreground">{props.email.trim()}</strong> for a sign-in
            link. It expires in a few minutes.
          </p>
        ) : (
          <form className="grid gap-2" onSubmit={props.onMagicLink}>
            <Label htmlFor={emailId}>Email</Label>
            <Input
              id={emailId}
              type="email"
              className="h-10 bg-field"
              value={props.email}
              onChange={(event) => props.onEmailChange(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              disabled={props.busy}
              required
            />
            {props.error ? <p className="text-destructive text-sm">{props.error}</p> : null}
            <Button type="submit" className="mt-1 h-10 w-full" disabled={props.busy}>
              {props.busy ? "Sending…" : "Email me a sign-in link"}
            </Button>
          </form>
        )}

        {props.sent && props.error ? (
          <p className="text-destructive text-sm">{props.error}</p>
        ) : null}
        {props.sent ? (
          <Button variant="ghost" size="sm" onClick={props.onUseDifferentEmail}>
            Use a different email
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
