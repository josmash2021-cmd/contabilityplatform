// "Términos del servicio de impuestos" (/terminos): the tax service terms the client accepts before sending.
// A draft written for the owner to have reviewed by a lawyer; the contact email is the one on /privacy.
type Section = { h: string; p?: string; list?: string[] };

const es = {
  title: "Términos del servicio de impuestos",
  updated: "Última actualización: 22 de noviembre de 2026",
  intro: "Estos términos explican cómo funciona el servicio de impuestos de Personal & Business Solutions: qué hacemos nosotros, qué haces tú y cómo firmas tu declaración. Al marcar la casilla y enviar tus documentos, los aceptas.",
  sections: [
    { h: "El servicio", p: "Preparamos y presentamos por vía electrónica (e-file) tu declaración federal ante el IRS y tu declaración estatal de Alabama del año que corresponde. Por ahora no preparamos declaraciones de otros estados. El servicio es gratis para ti: no te cobramos por preparar ni por presentar." },
    { h: "Lo que haces tú", list: [
      "Dar información completa, correcta y verdadera, y contestar las preguntas sobre tu situación.",
      "Subir documentos completos y que se lean bien.",
      "Avisarnos de cualquier ingreso, deducción o cambio que pueda afectar tu declaración.",
      "Revisar el resumen y los formularios antes de firmar.",
      "Contestar a tu preparador cuando te pida algo.",
    ] },
    { h: "Lo que hacemos nosotros", list: [
      "Un preparador revisa tus documentos y prepara tu declaración con la información que nos das.",
      "Te mandamos el resumen y los formularios para que los revises.",
      "Solo presentamos tu declaración después de que la firmes.",
      "Te avisamos en la app de cada paso, hasta que el IRS y Alabama la acepten.",
    ] },
    { h: "Tu firma electrónica", p: "Firmas la autorización de e-file (Formulario 8879) dentro de la app, con tu firma dibujada y tu nombre completo. Para confirmar que eres tú, pedimos un código enviado a tu correo para abrir Impuestos. Guardamos tu firma cifrada junto con la fecha, la hora, la dirección IP, el dispositivo y una huella (SHA-256) del documento que firmaste. Aceptas que esta firma electrónica cuente como tu firma en el Formulario 8879." },
    { h: "Reembolsos y pagos", p: "Los montos que te mostramos son los de tu declaración preparada. El reembolso te lo paga el IRS o el estado de Alabama directamente, no nosotros, y no podemos garantizar el monto final ni la fecha. Si debes impuestos, el pago lo haces tú al IRS o a Alabama." },
    { h: "Tus documentos y tu privacidad", p: "Usamos tu información solo para preparar y presentar tu declaración. Tus documentos se guardan cifrados y solo los ve tu preparador. Los detalles están en nuestra Política de privacidad." },
    { h: "Errores y correcciones", p: "Si después de presentarla aparece un error, te ayudamos a revisarlo y, si hace falta, a preparar una corrección (enmienda)." },
    { h: "Cancelar", p: "Puedes cancelar en cualquier momento antes de firmar, sin costo. Una vez presentada, la declaración no se puede retirar; solo se puede corregir con una enmienda." },
    { h: "Límites", p: "Preparamos tu declaración con la información que nos das. No respondemos por multas, intereses o diferencias que vengan de información incompleta, incorrecta o que no nos diste." },
    { h: "Cambios a estos términos", p: "Si cambiamos estos términos, te avisamos en la app antes de que apliquen a tu siguiente declaración." },
  ] as Section[],
  contactTitle: "Contacto",
  contact: "Escríbenos a",
  orChat: "o usa el chat con tu preparador dentro de Impuestos.",
  privacyLink: "Ver la Política de privacidad",
  back: "Volver",
};

const en: typeof es = {
  title: "Tax Service Terms",
  updated: "Last updated: November 22, 2026",
  intro: "These terms explain how the Personal & Business Solutions tax service works: what we do, what you do, and how you sign your return. By checking the box and sending your documents, you accept them.",
  sections: [
    { h: "The service", p: "We prepare and electronically file (e-file) your federal return with the IRS and your Alabama state return for the corresponding year. For now we don't prepare returns for other states. The service is free for you: we don't charge you to prepare or to file." },
    { h: "Your part", list: [
      "Give complete, correct and truthful information, and answer the questions about your situation.",
      "Upload complete, readable documents.",
      "Tell us about any income, deduction or change that may affect your return.",
      "Review the summary and the forms before signing.",
      "Reply to your preparer when they ask you for something.",
    ] },
    { h: "Our part", list: [
      "A preparer reviews your documents and prepares your return with the information you give us.",
      "We send you the summary and the forms to review.",
      "We only file your return after you sign it.",
      "We let you know in the app at every step, until the IRS and Alabama accept it.",
    ] },
    { h: "Your electronic signature", p: "You sign the e-file authorization (Form 8879) inside the app, with your drawn signature and your full name. To confirm it's you, we ask for a code sent to your email to open Taxes. We keep your signature encrypted together with the date, time, IP address, device and a fingerprint (SHA-256) of the document you signed. You agree that this electronic signature counts as your signature on Form 8879." },
    { h: "Refunds and payments", p: "The amounts we show you are those of your prepared return. Your refund is paid to you directly by the IRS or the State of Alabama, not by us, and we can't guarantee the final amount or the date. If you owe taxes, you make the payment to the IRS or Alabama." },
    { h: "Your documents and your privacy", p: "We use your information only to prepare and file your return. Your documents are stored encrypted and only your preparer sees them. The details are in our Privacy Policy." },
    { h: "Errors and corrections", p: "If an error shows up after filing, we help you review it and, if needed, prepare a correction (amended return)." },
    { h: "Canceling", p: "You can cancel at any time before signing, at no cost. Once filed, a return can't be withdrawn; it can only be corrected with an amended return." },
    { h: "Limits", p: "We prepare your return with the information you give us. We're not responsible for penalties, interest or differences that come from incomplete or incorrect information, or information you didn't give us." },
    { h: "Changes to these terms", p: "If we change these terms, we'll let you know in the app before they apply to your next return." },
  ],
  contactTitle: "Contact",
  contact: "Write to us at",
  orChat: "or use the chat with your preparer inside Taxes.",
  privacyLink: "See the Privacy Policy",
  back: "Back",
};

export const termsCopy = { es, en };
