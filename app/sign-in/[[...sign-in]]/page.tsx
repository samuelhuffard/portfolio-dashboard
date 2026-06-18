import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="terminal-panel w-full max-w-md p-4">
        <SignIn
          routing="path"
          path="/sign-in"
          appearance={{
            elements: {
              cardBox: "shadow-none",
              card: "bg-transparent shadow-none",
              headerTitle: "text-white",
              headerSubtitle: "text-slate-400",
              socialButtonsBlockButton: "bg-white/[0.04] border-white/10 text-white",
              formButtonPrimary: "bg-emerald-400 text-slate-950 hover:bg-emerald-300",
              formFieldInput: "bg-black/30 border-white/10 text-white",
              footerActionText: "text-slate-400",
            },
          }}
        />
      </div>
    </div>
  );
}
