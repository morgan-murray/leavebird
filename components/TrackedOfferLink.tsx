"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { AffiliatePlacement } from "@/lib/affiliate-catalog";

export function TrackedOfferLink({ offerId, placement, className, children }: {
  offerId: string;
  placement: AffiliatePlacement;
  className?: string;
  children: ReactNode;
}) {
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const link = linkRef.current;
    if (!link) return;
    let sent = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const send = () => {
      if (sent) return;
      sent = true;
      const body = JSON.stringify({ eventKey: crypto.randomUUID(), offerId, placement });
      void fetch("/api/affiliate/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => undefined);
    };
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.5)) {
        timer = setTimeout(send, 750);
      } else if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    }, { threshold: [0.5] });
    observer.observe(link);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [offerId, placement]);

  return <a
    ref={linkRef}
    className={className}
    href={`/go/${encodeURIComponent(offerId)}?placement=${encodeURIComponent(placement)}`}
    target="_blank"
    rel="noreferrer"
  >{children}</a>;
}
