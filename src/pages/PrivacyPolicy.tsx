import { AnimatedPage } from "@/components/AnimatedPage";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router";

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <AnimatedPage className="p-4 lg:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)} className="h-9 px-2 border-neutral-200">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold text-black flex items-center gap-2">
            <Shield className="w-5 h-5 text-neutral-600" />
            Politica de Privacidad
          </h1>
          <p className="text-xs text-neutral-400">Ultima actualizacion: 28 de Mayo 2026</p>
        </div>
      </div>

      <Card className="border-neutral-200 rounded-xl shadow-none">
        <CardContent className="p-6 space-y-6 text-sm text-neutral-700">

          <section>
            <h2 className="text-base font-semibold text-black mb-2">1. Informacion que recopilamos</h2>
            <p>
              Aethel Accounting Platform recopila informacion necesaria para proporcionar servicios de contabilidad y gestion financiera, incluyendo:
            </p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li><strong>Informacion de cuenta:</strong> nombre, correo electronico y datos de autenticacion.</li>
              <li><strong>Datos bancarios:</strong> transacciones, saldos y numeros de cuenta (enmascarados) cuando conectas tu cuenta bancaria a traves de Plaid.</li>
              <li><strong>Datos de ventas:</strong> informacion sobre productos vendidos y clientes que ingresas manualmente.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-black mb-2">2. Uso de Plaid para conectar cuentas bancarias</h2>
            <p>
              Utilizamos <strong>Plaid Inc.</strong> para permitirte conectar tus cuentas bancarias de forma segura. 
              Cuando usas la funcion "Conectar Banco":
            </p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Tus credenciales bancarias <strong>nunca</strong> son almacenadas en nuestros servidores.</li>
              <li>Plaid maneja la autenticacion directamente con tu banco.</li>
              <li>Solo recibimos tokens de acceso encriptados y datos de transacciones.</li>
              <li>Puedes desconectar tu cuenta bancaria en cualquier momento.</li>
            </ul>
            <p className="mt-2">
              Para mas informacion sobre como Plaid maneja tus datos, visita su politica de privacidad en{" "}
              <a href="https://plaid.com/legal/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                plaid.com/legal
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-black mb-2">3. Como usamos tu informacion</h2>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Proporcionar reportes financieros y analisis de transacciones.</li>
              <li>Generar categorizaciones automaticas de ingresos y gastos.</li>
              <li>Mostrar saldos y movimientos bancarios en tiempo real.</li>
              <li>Mejorar nuestros servicios de contabilidad.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-black mb-2">4. Comparticion de datos</h2>
            <p>
              <strong>No vendemos ni compartimos</strong> tu informacion personal con terceros para fines de marketing. 
              Solo compartimos datos con:
            </p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li><strong>Plaid Inc.</strong> - para la conexion bancaria (segun su politica de privacidad).</li>
              <li><strong>Proveedores de infraestructura</strong> - solo lo necesario para operar la plataforma.</li>
              <li><strong>Obligaciones legales</strong> - si es requerido por ley.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-black mb-2">5. Retencion y Eliminacion de Datos</h2>
            <p>
              <strong>Retencion:</strong> Conservamos tus datos financieros y personales mientras mantengas una cuenta activa en nuestra plataforma. 
              Los datos bancarios obtenidos a traves de Plaid se sincronizan y almacenan para mostrar reportes historicos.
            </p>
            <p className="mt-2">
              <strong>Eliminacion:</strong> Cuando eliminas tu cuenta:
            </p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Todos tus datos personales y financieros se eliminan permanentemente de nuestra base de datos dentro de <strong>30 dias</strong>.</li>
              <li>Los tokens de acceso a Plaid se revocan inmediatamente.</li>
              <li>Las transacciones bancarias almacenadas se borran completamente (no se mantienen copias de respaldo con datos personales).</li>
              <li>Puedes solicitar la eliminacion de datos enviando un correo a <strong>josmash2021@gmail.com</strong>.</li>
            </ul>
            <p className="mt-2">
              <strong>Revision periodica:</strong> Revisamos nuestra politica de retencion de datos cada <strong>6 meses</strong> 
              para asegurar el cumplimiento con las leyes de privacidad aplicables (CCPA, GDPR donde aplique).
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-black mb-2">7. Seguridad</h2>
            <p>
              Implementamos medidas de seguridad tecnicas y organizativas para proteger tus datos, 
              incluyendo encriptacion en transito y en reposo, autenticacion segura y acceso restringido 
              solo a personal autorizado.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-black mb-2">8. Tus derechos</h2>
            <p>Puedes:</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Acceder a tus datos personales en cualquier momento.</li>
              <li>Solicitar la eliminacion de tu cuenta y datos asociados.</li>
              <li>Desconectar tus cuentas bancarias cuando lo desees.</li>
              <li>Exportar tus datos financieros.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-black mb-2">9. Contacto</h2>
            <p>
              Si tienes preguntas sobre esta politica de privacidad, contactanos a{" "}
              <strong>josmash2021@gmail.com</strong>.
            </p>
          </section>

        </CardContent>
      </Card>
    </AnimatedPage>
  );
}
