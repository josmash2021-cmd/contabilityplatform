import { Fragment } from "react";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router";
import { useCopy } from "@/i18n/useI18n";
import { billingCopy } from "@/i18n/copy/billing";

const CONTACT_EMAIL = "josmash2021@gmail.com";

/** Renders copy segments: even items as plain text, odd items in bold. */
function Rich({ parts }: { parts: string[] }) {
  return <>{parts.map((part, i) => <Fragment key={i}>{i % 2 ? <strong>{part}</strong> : part}</Fragment>)}</>;
}

export default function PrivacyPolicy() {
  const navigate = useNavigate();
  const t = useCopy(billingCopy).privacy;

  return (
    <AnimatedPage className="p-4 lg:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="h-9 px-2 border-neutral-200">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold text-black flex items-center gap-2">
            <Shield className="w-5 h-5 text-neutral-600" />
            {t.title}
          </h1>
          <p className="text-xs text-neutral-400">{t.updated}</p>
        </div>
      </div>

      <Card className="border-neutral-200 rounded-xl shadow-none">
        <CardContent className="p-6 space-y-6 text-sm text-neutral-700">

          <section>
            <h2 className="text-base font-semibold text-black mb-2">{t.collect.title}</h2>
            <p>
              {t.collect.intro}
            </p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              {t.collect.items.map((item, i) => <li key={i}><Rich parts={item} /></li>)}
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-black mb-2">{t.plaid.title}</h2>
            <p>
              <Rich parts={t.plaid.intro} />
            </p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              {t.plaid.items.map((item, i) => <li key={i}><Rich parts={item} /></li>)}
            </ul>
            <p className="mt-2">
              {t.plaid.more}{" "}
              <a href="https://plaid.com/legal/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                plaid.com/legal
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-black mb-2">{t.use.title}</h2>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              {t.use.items.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-black mb-2">{t.sharing.title}</h2>
            <p>
              <Rich parts={t.sharing.intro} />
            </p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              {t.sharing.items.map((item, i) => <li key={i}><Rich parts={item} /></li>)}
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-black mb-2">{t.retention.title}</h2>
            <p>
              <Rich parts={t.retention.retention} />
            </p>
            <p className="mt-2">
              <Rich parts={t.retention.deletion} />
            </p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              {t.retention.items(CONTACT_EMAIL).map((item, i) => <li key={i}><Rich parts={item} /></li>)}
            </ul>
            <p className="mt-2">
              <Rich parts={t.retention.review} />
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-black mb-2">{t.security.title}</h2>
            <p>
              {t.security.text}
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-black mb-2">{t.rights.title}</h2>
            <p>{t.rights.intro}</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              {t.rights.items.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-black mb-2">{t.contact.title}</h2>
            <p>
              <Rich parts={t.contact.text(CONTACT_EMAIL)} />
            </p>
          </section>

        </CardContent>
      </Card>
    </AnimatedPage>
  );
}
