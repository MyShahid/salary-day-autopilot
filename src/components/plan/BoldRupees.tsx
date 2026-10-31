/** Renders a sentence with every rupee amount (₹45,000) in bold. */
export function BoldRupees({ text }: { text: string }) {
  const parts = text.split(/(₹[\d,]+)/);
  return (
    <>
      {parts.map((p, i) =>
        /^₹[\d,]+$/.test(p) ? (
          <strong key={i} className="font-bold text-slate-950">
            {p}
          </strong>
        ) : (
          p
        ),
      )}
    </>
  );
}
