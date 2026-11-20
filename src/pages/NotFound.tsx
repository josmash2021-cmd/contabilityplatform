import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router";
import { useCopy } from "@/i18n/useI18n";
import { businessCopy } from "@/i18n/copy/business";

export default function NotFound() {
  const { notFound: t } = useCopy(businessCopy);
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-sm text-center">
        <CardHeader>
          <CardTitle className="text-4xl font-bold">404</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">{t.text}</p>
          <Button asChild className="w-full">
            <Link to="/">{t.back}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
