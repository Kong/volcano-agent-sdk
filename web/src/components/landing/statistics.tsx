export function Statistics() {
  const stats = [
    { label: "LLM Providers", value: "8+" },
    { label: "Control flow patterns", value: "6" },
    { label: "Retry strategies", value: "3" },
    { label: "MCP tools", value: "∞" },
  ];

  return (
    <section className="py-16">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="font-space-mono mb-2 text-2xl font-bold sm:text-3xl">
                {stat.value}
              </div>
              <div className="font-space-mono text-base sm:text-lg">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
