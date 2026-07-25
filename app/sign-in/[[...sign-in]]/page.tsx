import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div
          className="flex items-center gap-2.5 border border-b-0 px-5 py-4"
          style={{ borderColor: "var(--rule)", background: "var(--panel)" }}
        >
          <span
            className="flex items-center justify-center font-serif"
            style={{
              width: 26,
              height: 26,
              border: "1px solid var(--ink)",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.02em",
            }}
          >
            PM
          </span>
          <span className="flex flex-col" style={{ gap: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "-0.005em" }}>
              Portfolio Manager
            </span>
            <span
              style={{
                fontSize: 9.5,
                letterSpacing: "0.13em",
                textTransform: "uppercase",
                color: "var(--muted-2)",
              }}
            >
              Private Wealth Office
            </span>
          </span>
        </div>
        <div className="border p-4" style={{ borderColor: "var(--rule)", background: "var(--panel)" }}>
          <SignIn
            routing="path"
            path="/sign-in"
            appearance={{
              elements: {
                cardBox: "shadow-none rounded-none",
                card: "bg-transparent shadow-none rounded-none",
                headerTitle: "text-[var(--ink)]",
                headerSubtitle: "text-[var(--muted)]",
                socialButtonsBlockButton:
                  "rounded-none border-[var(--rule)] bg-[var(--panel)] text-[var(--ink)]",
                formButtonPrimary:
                  "rounded-none bg-[var(--accent)] text-white hover:bg-[var(--accent-dark)]",
                formFieldInput: "rounded-none border-[var(--rule)] bg-[var(--panel)] text-[var(--ink)]",
                footerActionText: "text-[var(--muted)]",
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
