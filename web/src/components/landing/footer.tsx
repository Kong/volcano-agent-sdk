import { Link } from "@tanstack/react-router";
import { Github } from "lucide-react";

const XIcon = () => (
  <svg
    className="h-6 w-6"
    fill="currentColor"
    viewBox="0 0 1200 1227"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M714.163 519.284L1160.89 0H1055.03L667.137 450.887L357.328 0H0L468.492 681.821L0 1226.37H105.866L515.491 750.218L842.672 1226.37H1200L714.137 519.284H714.163ZM569.165 687.828L521.697 619.934L144.011 79.6944H306.615L611.412 515.685L658.88 583.579L1055.08 1150.3H892.476L569.165 687.854V687.828Z"
      fill="currentColor"
    />
  </svg>
);

export function Footer() {
  return (
    <footer className="border-t">
      <div className="container mx-auto px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          <a
            href="https://konghq.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <div className="mb-4 flex items-center space-x-2">
              <img src="/kong.svg" alt="Kong" className="h-10" />
            </div>
            <p className="text-sm leading-[1.3] font-bold tracking-[1.5px] text-[#062f4d] uppercase">
              Built with ❤️ By Kong
            </p>
          </a>
          <div>
            <h3 className="mb-4 font-semibold">Documentation</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/docs" className="hover:">
                  Getting Started
                </Link>
              </li>
              <li>
                <Link to="/docs" hash="quick-start" className="hover:">
                  Quick Start
                </Link>
              </li>
              <li>
                <Link to="/docs/api" className="hover:">
                  API Reference
                </Link>
              </li>
              <li>
                <Link to="/docs/examples" className="hover:">
                  Examples
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 font-semibold">Resources</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/docs/patterns" className="hover:">
                  Patterns
                </Link>
              </li>
              <li>
                <Link to="/docs/providers" className="hover:">
                  Providers
                </Link>
              </li>
              <li>
                <Link to="/docs/features" className="hover:">
                  Features
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 font-semibold">Community</h3>
            <div className="flex space-x-4">
              <a
                href="https://github.com/Kong/volcano-agent-sdk"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="h-6 w-6" />
              </a>
              <a
                href="https://x.com/usevolcano"
                target="_blank"
                rel="noopener noreferrer"
              >
                <XIcon />
              </a>
            </div>
          </div>
        </div>
        <div className="flex w-full justify-center">
          <div className="flex pt-10">
            <p>&copy; {new Date().getFullYear()} Kong Inc.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
