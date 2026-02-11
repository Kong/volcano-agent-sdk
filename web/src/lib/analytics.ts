// Google Analytics utilities
// Handles dynamic loading of GA script and event tracking

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;
const IS_PRODUCTION = import.meta.env.PROD;

/**
 * Initialize Google Analytics
 * Only loads in production and when a valid measurement ID is configured
 */
export function initializeAnalytics(): void {
  // Only load GA in production and when measurement ID is configured
  if (
    !IS_PRODUCTION ||
    !GA_MEASUREMENT_ID ||
    GA_MEASUREMENT_ID === "G-XXXXXXXXXX"
  ) {
    console.log(
      "[Analytics] Skipping GA initialization (dev mode or no measurement ID)"
    );
    return;
  }

  // Check if already initialized
  if (window.gtag) {
    console.log("[Analytics] GA already initialized");
    return;
  }

  try {
    // Load GA script
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(script);

    // Initialize dataLayer
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };

    // Configure GA
    window.gtag("js", new Date());
    window.gtag("config", GA_MEASUREMENT_ID, {
      send_page_view: false, // We'll handle page views manually for SPA
    });

    console.log("[Analytics] GA initialized successfully");
  } catch (error) {
    console.error("[Analytics] Failed to initialize GA:", error);
  }
}

/**
 * Track a page view
 * @param path - The page path to track (e.g., '/docs/installation')
 * @param title - Optional page title
 */
export function trackPageView(path: string, title?: string): void {
  if (!IS_PRODUCTION || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    window.gtag("event", "page_view", {
      page_path: path,
      page_title: title || document.title,
      page_location: window.location.href,
    });
    console.log("[Analytics] Page view tracked:", path);
  } catch (error) {
    console.error("[Analytics] Failed to track page view:", error);
  }
}

/**
 * Track a custom event
 * @param eventName - Name of the event
 * @param parameters - Optional event parameters
 */
export function trackEvent(
  eventName: string,
  parameters?: Record<string, unknown>
): void {
  if (!IS_PRODUCTION || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    window.gtag("event", eventName, parameters);
    console.log("[Analytics] Event tracked:", eventName, parameters);
  } catch (error) {
    console.error("[Analytics] Failed to track event:", error);
  }
}

/**
 * Check if analytics is enabled
 */
export function isAnalyticsEnabled(): boolean {
  return (
    IS_PRODUCTION && !!GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== "G-XXXXXXXXXX"
  );
}
