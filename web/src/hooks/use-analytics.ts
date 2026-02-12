import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { trackPageView } from "@/lib/analytics";

/**
 * Hook to track page views on route changes
 * Automatically tracks initial page load and subsequent navigation
 */
export function usePageTracking() {
  const router = useRouter();

  useEffect(() => {
    // Track initial page view
    trackPageView(
      window.location.pathname + window.location.search,
      document.title
    );

    // Subscribe to router events for subsequent navigation
    const unsubscribe = router.subscribe("onLoad", (event) => {
      const path = event.toLocation.pathname + event.toLocation.search;
      trackPageView(path, document.title);
    });

    return () => {
      unsubscribe();
    };
  }, [router]);
}
