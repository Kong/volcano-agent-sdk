import { Star } from "lucide-react";
import { useEffect, useState } from "react";

export function GitHubCTA() {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    fetch("https://api.github.com/repos/kong/volcano-agent-sdk")
      .then((res) => res.json())
      .then((data) => setStars(data.stargazers_count || 0))
      .catch(() => {});
  }, []);

  return (
    <section className="py-16">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-space-mono mb-4 text-2xl font-bold sm:text-3xl lg:text-4xl">
            Built in the Open, For Everyone
          </h2>

          <p className="mb-8 text-base text-gray-700 sm:text-lg">
            Fully open source and community-driven. Explore the code,
            contribute, and help shape the future of AI agent development.
          </p>

          <a
            href="https://github.com/kong/volcano-agent-sdk"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-btn-primary inline-flex items-center justify-center gap-3 border-2 border-black px-6 py-3 text-base font-medium transition-transform hover:scale-105"
          >
            <Star className="h-5 w-5" />
            <span>Star on GitHub</span>
            {stars !== null && (
              <span className="font-space-mono ml-1 bg-black px-2 py-1 text-sm font-bold text-white">
                {stars.toLocaleString()}
              </span>
            )}
          </a>
        </div>
      </div>
    </section>
  );
}
