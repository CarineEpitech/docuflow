import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { FileQuestion, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center px-4">
        <FileQuestion className="w-16 h-16 mx-auto text-muted-foreground/50 mb-6" />
        <h1 className="text-4xl font-bold tracking-tight mb-3" data-testid="text-404-title">
          404
        </h1>
        <h2 className="text-xl font-medium mb-2" data-testid="text-404-subtitle">
          Page not found
        </h2>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto" data-testid="text-404-description">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Button asChild data-testid="button-go-home">
          <Link href="/">
            <Home className="w-4 h-4 mr-2" />
            Back to Home
          </Link>
        </Button>
      </div>
    </div>
  );
}
