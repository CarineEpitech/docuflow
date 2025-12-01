import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FileText, Folder, Search, Zap, Users, Lock } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <FileText className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-semibold tracking-tight" data-testid="text-brand-name">
                DocuFlow
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button asChild data-testid="button-login">
                <Link href="/auth">Sign In</Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main>
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6" data-testid="text-hero-title">
              Documentation that keeps up with your team
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto" data-testid="text-hero-description">
              A powerful Notion-like editor for organizing all your tech projects. 
              Create beautiful docs, nest pages, and collaborate seamlessly.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" asChild data-testid="button-get-started">
                <Link href="/auth" className="px-8">
                  Get Started
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="py-16 px-4 sm:px-6 lg:px-8 bg-muted/30">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12" data-testid="text-features-title">
              Everything you need for great documentation
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <FeatureCard
                icon={<Folder className="w-6 h-6" />}
                title="Project Organization"
                description="Organize documentation by project with nested pages and intuitive navigation."
                testId="card-feature-projects"
              />
              <FeatureCard
                icon={<FileText className="w-6 h-6" />}
                title="Block-based Editor"
                description="Write with a powerful Notion-like editor supporting headings, lists, code blocks, and more."
                testId="card-feature-editor"
              />
              <FeatureCard
                icon={<Search className="w-6 h-6" />}
                title="Full-text Search"
                description="Find anything instantly with powerful search across all your projects and pages."
                testId="card-feature-search"
              />
              <FeatureCard
                icon={<Zap className="w-6 h-6" />}
                title="Slash Commands"
                description="Use / commands to quickly insert blocks, format text, and add media."
                testId="card-feature-commands"
              />
              <FeatureCard
                icon={<Users className="w-6 h-6" />}
                title="Media Support"
                description="Embed images, videos, and files directly in your documentation."
                testId="card-feature-media"
              />
              <FeatureCard
                icon={<Lock className="w-6 h-6" />}
                title="Secure Access"
                description="Keep your documentation private with secure authentication."
                testId="card-feature-security"
              />
            </div>
          </div>
        </section>

        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4" data-testid="text-cta-title">
              Ready to streamline your documentation?
            </h2>
            <p className="text-muted-foreground mb-8" data-testid="text-cta-description">
              Join your team and start creating beautiful, organized documentation today.
            </p>
            <Button size="lg" asChild data-testid="button-cta-start">
              <Link href="/auth">Start for Free</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto text-center text-sm text-muted-foreground">
          <p data-testid="text-footer-copyright">Built with care for teams who love great documentation.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  testId,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  testId: string;
}) {
  return (
    <div
      className="bg-card border border-card-border rounded-lg p-6"
      data-testid={testId}
    >
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 text-primary">
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm">{description}</p>
    </div>
  );
}
