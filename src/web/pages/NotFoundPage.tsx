import { Link } from "react-router";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">Nothing lives at this address.</p>
      <Button asChild>
        <Link to="/contacts">Back to contacts</Link>
      </Button>
    </div>
  );
}
