const ITEMS = [
  "Sublimación full-print",
  "Producción propia",
  "Diseño incluido",
  "Talles infantiles y adultos",
  "Clubes · Colegios · Egresados",
  "Seguimiento online del pedido",
  "Envíos a todo el país",
];

/**
 * Franja de prueba social/diferenciales en marquee infinito.
 * El track duplica la lista y se desplaza -50% — el corte es invisible.
 */
export function ProofStrip() {
  const doubled = [...ITEMS, ...ITEMS];
  return (
    <div
      className="marquee-hover-pause texture-fade-x overflow-hidden border-y border-navy-line bg-navy-900 py-4"
      aria-label="Por qué elegirnos"
    >
      <div className="animate-marquee flex w-max items-center">
        {doubled.map((item, index) => (
          <span
            key={`${item}-${index}`}
            aria-hidden={index >= ITEMS.length}
            className="flex shrink-0 items-center"
          >
            <span className="label-caps text-on-navy">{item}</span>
            <span className="mx-8 h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          </span>
        ))}
      </div>
    </div>
  );
}
