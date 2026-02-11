import { useLocation } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { buildNavigation } from "./build-navigation";
import { SidebarItem } from "./sidebar-item";
import { SearchInput } from "@/components/search/search-input";
import { scrollToDocElement, scrollToDocTop } from "@/lib/scroll-utils";

const navigation = buildNavigation();

interface DocsSidebarProps {
  onMobileClose?: () => void;
}

export function DocsSidebar({ onMobileClose }: DocsSidebarProps = {}) {
  const location = useLocation();
  const currentPath = location.pathname;

  // Track active heading from both URL hash and scroll events
  const [activeHeadingId, setActiveHeadingId] = useState("");

  // Reference to sidebar element to preserve scroll position
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Update active heading when location changes (single source of truth)
  useEffect(() => {
    // Use window.location.hash as the source of truth (most reliable)
    const hash = window.location.hash.replace("#", "");
    setActiveHeadingId(hash);

    // Scroll to the element when location changes with a hash (handles cross-page navigation)
    if (hash) {
      // Use setTimeout for cross-page navigation to allow content to render
      setTimeout(() => {
        scrollToDocElement(hash);
      }, 100);
    } else {
      // No hash: scroll to top of content
      setTimeout(() => {
        scrollToDocTop();
      }, 100);
    }
  }, [location]);

  // Also listen for direct hash changes (for same-page navigation)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "");
      setActiveHeadingId(hash);

      // Scroll to the element when hash changes
      if (hash) {
        requestAnimationFrame(() => {
          scrollToDocElement(hash);
        });
      }
    };

    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  // Listen for scroll-based heading changes from right sidebar (table of contents)
  useEffect(() => {
    const handleHeadingActive = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>;
      setActiveHeadingId(customEvent.detail.id);
    };

    window.addEventListener("docs-heading-active", handleHeadingActive);

    return () => {
      window.removeEventListener("docs-heading-active", handleHeadingActive);
    };
  }, []);

  // Restore sidebar scroll position on mount
  useEffect(() => {
    if (sidebarRef.current) {
      const scrollPos = sessionStorage.getItem("sidebar-scroll-pos");
      if (scrollPos) {
        sidebarRef.current.scrollTop = parseInt(scrollPos, 10);
      }
    }
  }, []);

  const preserveSidebarScroll = () => {
    if (sidebarRef.current) {
      sessionStorage.setItem(
        "sidebar-scroll-pos",
        sidebarRef.current.scrollTop.toString()
      );
    }
  };

  const handleItemClick = () => {
    // Close mobile sidebar when an item is clicked
    if (onMobileClose) {
      onMobileClose();
    }
    preserveSidebarScroll();
  };

  return (
    <aside className="relative h-full w-[17.5rem] overflow-hidden border-r bg-white text-[0.875rem] lg:w-[17.5rem]">
      {/* Scrollable navigation - placed first so it's behind */}
      <div
        ref={sidebarRef}
        className="sidebar-scroll-container absolute inset-0 overflow-y-auto pt-[44px]"
        onScroll={preserveSidebarScroll}
      >
        <nav className="space-y-6 p-4">
          {navigation.map((section) => (
            <div key={section.title}>
              <h3 className="mb-3 text-sm font-semibold lg:text-base">
                {section.title}
              </h3>
              <ul className="space-y-1">
                {section.items.map((item) => {
                  // Check if this item's href matches the current location
                  let isActive = false;

                  if (item.href.includes("#")) {
                    // Extract path and hash from item href
                    const [itemPath, itemHash] = item.href.split("#");

                    // Only match if we're on the same page
                    if (itemPath === currentPath || itemPath === "") {
                      // Exact match takes priority
                      if (activeHeadingId === itemHash) {
                        isActive = true;
                      }
                      // Only mark as parent if this heading is NOT directly in the nav
                      else if (
                        activeHeadingId &&
                        item.childHeadingIds?.includes(activeHeadingId)
                      ) {
                        // Check if there's an exact match elsewhere in this section
                        const hasExactMatch = section.items.some(
                          (sectionItem) =>
                            sectionItem.href.split("#")[1] === activeHeadingId
                        );
                        // Only highlight parent if no exact match exists
                        isActive = !hasExactMatch;
                      }
                    }
                  } else {
                    // For page-only links, only active if on that page AND no hash
                    isActive = currentPath === item.href && !activeHeadingId;
                  }

                  return (
                    <SidebarItem
                      key={item.href}
                      title={item.title}
                      href={item.href}
                      // icon={item.icon}
                      isActive={isActive}
                      onPreserveScroll={handleItemClick}
                    />
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      {/* Fixed search header - placed last so it's on top */}
      <div
        className="absolute top-0 right-0 left-0 z-10 bg-white/50"
        style={{
          backdropFilter: "blur(12px) saturate(150%)",
          WebkitBackdropFilter: "blur(12px) saturate(150%)",
          backgroundColor: "rgba(255, 255, 255, 0.5)",
        }}
      >
        <SearchInput />
        <div className="mx-1 border-b border-black/50"></div>
      </div>
    </aside>
  );
}
