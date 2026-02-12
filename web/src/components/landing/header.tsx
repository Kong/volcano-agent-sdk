import { Link } from "@tanstack/react-router";
import { Menu, X, Github } from "lucide-react";
import { useState } from "react";

export function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b backdrop-blur">
      <div className="container flex h-16 items-center px-4 sm:px-0">
        <Link to="/" className="flex items-center space-x-2">
          <img src="/volcano__icn.png" alt="Volcano" className="h-8 w-8" />
          <span className="font-space-mono text-stroke-white-hover text-xl font-bold">
            Volcano Agent SDK
          </span>
        </Link>

        <nav className="ml-auto hidden items-center gap-2 font-medium md:flex">
          <a
            href="/docs#key-features"
            className="text-stroke-white-hover font-space-mono px-3 py-2 transition-all hover:font-bold"
          >
            Features
          </a>
          <a
            href="/docs/examples"
            className="text-stroke-white-hover font-space-mono px-3 py-2 transition-all hover:font-bold"
          >
            Examples
          </a>
          <Link
            to="/docs"
            className="text-stroke-white-hover font-space-mono px-3 py-2 transition-all hover:font-bold"
            activeProps={{
              className: "px-3 py-2 font-bold text-black font-space-mono",
            }}
            // activeOptions={{ exact: true }}
          >
            Docs
          </Link>
          <a
            href="https://github.com/Kong/volcano-agent-sdk"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 transition-all hover:font-bold"
          >
            <Github className="icon-stroke-white-hover h-5 w-5 hover:stroke-3" />
          </a>
          <a
            href="https://www.npmjs.com/package/@volcano.dev/agent"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-btn-primary text-primary-foreground font-space-mono inline-flex items-center rounded-none border-2 border-black px-4 py-2 text-sm font-bold transition-colors hover:opacity-85"
          >
            npm install
          </a>
          {/* <ThemeToggle /> */}
        </nav>

        <button
          className="ml-auto md:hidden"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {isMobileMenuOpen && (
        <div className="border-t md:hidden">
          <nav className="container flex flex-col space-y-3 py-4">
            <a
              href="/docs#key-features"
              className="font-space-mono text-stroke-white-hover px-3 py-2 transition-all hover:font-bold"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Features
            </a>
            <a
              href="/docs/examples"
              className="font-space-mono text-stroke-white-hover px-3 py-2 transition-all hover:font-bold"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Examples
            </a>
            <Link
              to="/docs"
              className="font-space-mono text-stroke-white-hover px-3 py-2 transition-all hover:font-bold"
              activeProps={{
                className: "px-3 py-2 font-bold text-black font-space-mono",
              }}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Docs
            </Link>
            <a
              href="https://github.com/Kong/volcano-agent-sdk"
              target="_blank"
              rel="noopener noreferrer"
              className="font-space-mono icon-stroke-white-hover flex items-center gap-2 px-3 py-2 transition-all hover:font-bold hover:text-gray-400"
            >
              <Github className="h-5 w-5" />
              GitHub
            </a>
            <a
              href="https://www.npmjs.com/package/@volcano.dev/agent"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-btn-primary text-primary-foreground font-space-mono mx-3 inline-flex items-center justify-center rounded-none border-2 border-black px-4 py-2 text-sm font-medium transition-colors hover:opacity-85"
            >
              npm install
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
