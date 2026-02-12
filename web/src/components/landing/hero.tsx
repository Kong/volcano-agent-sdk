import { Link } from "@tanstack/react-router";
import { Copy, Check } from "lucide-react";
import { useCallback, useRef, useState } from "react";

export function Hero() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [copied, setCopied] = useState(false);
  const animationFrameRef = useRef<number | null>(null);

  // Setup initial 0-3s loop
  const setupDefaultLoop = useCallback(() => {
    if (!videoRef.current) return;

    // Cancel any existing animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const loopSegment = () => {
      if (!videoRef.current) return;

      if (videoRef.current.currentTime >= 3) {
        videoRef.current.currentTime = 0;
        videoRef.current.play();
      }

      animationFrameRef.current = requestAnimationFrame(loopSegment);
    };

    loopSegment();
  }, []);

  const handleCopy = async () => {
    navigator.clipboard.writeText("npm install @volcano.dev/agent");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);

    if (videoRef.current) {
      // Cancel the default loop
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      // Pause, seek, then play
      videoRef.current.pause();
      videoRef.current.currentTime = 11;
      videoRef.current.playbackRate = 3;

      // Wait for seek to complete
      await new Promise((resolve) => {
        if (videoRef.current) {
          videoRef.current.onseeked = () => resolve(null);
        }
      });

      videoRef.current.play();

      // Return to 0-3s loop when reaching 20s
      videoRef.current.ontimeupdate = () => {
        if (videoRef.current && videoRef.current.currentTime >= 13) {
          // videoRef.current.playbackRate = 1
        }

        if (videoRef.current && videoRef.current.currentTime >= 15) {
          videoRef.current.pause();
          videoRef.current.playbackRate = 1;
          videoRef.current.currentTime = 0;
          videoRef.current.ontimeupdate = null; // Remove this handler
          setupDefaultLoop();
          videoRef.current.play();
        }
      };
    }
  };

  return (
    <section className="relative">
      {/* <div className="absolute right-0 bottom-0 w-full sm:w-2/3 md:w-2/3 lg:w-3/4 xl:w-2/3"> */}
      <div className="absolute right-0 bottom-0 w-full xl:w-2/3">
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          onLoadedMetadata={setupDefaultLoop}
          className="h-96 w-full object-cover object-bottom sm:h-[500px] md:h-[600px] lg:h-[700px] xl:object-contain"
        >
          <source src="/the_volcano.mp4" type="video/mp4" />
        </video>
      </div>
      <div className="relative container px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
        <div className="max-w-4xl text-left">
          <h1 className="font-space-mono text-stroke-white mb-6 text-3xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Build AI Agents That
            <span className=""> Actually Do Things</span>
          </h1>

          <div className="mb-4 h-[100px]">
            <p className="text-stroke-white w-fit text-base sm:text-xl">
              Build agents that seamlessly combine LLM reasoning
            </p>
            <p className="text-stroke-white w-fit text-base sm:text-xl">
              with real-world actions via MCP tools &mdash; in just few lines of
              TypeScript.
            </p>
          </div>

          <div className="flex w-full flex-col gap-4 sm:w-fit">
            <div className="flex items-stretch justify-start gap-4">
              <Link
                to="/docs"
                hash="quick-start"
                className="bg-btn-primary inline-flex flex-1 items-center justify-center border-2 px-6 py-3 text-sm font-medium hover:opacity-85 sm:flex-none sm:text-base"
              >
                Get Started
              </Link>
              <div className="bg-terminal inline-flex w-fit items-center justify-between gap-2 border-2 border-black px-3 py-3 text-sm font-light text-white sm:text-base">
                <div className="flex w-fit items-center gap-2">
                  $ npm i{" "}
                  <span className="text-color-primary">@volcano.dev/agent</span>
                </div>
                <button
                  className="text-color-primary cursor-pointer pl-2 transition-opacity hover:opacity-60"
                  onClick={handleCopy}
                >
                  {copied ? <Check /> : <Copy />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
