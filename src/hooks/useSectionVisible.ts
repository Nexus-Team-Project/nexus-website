import { useState, useEffect, useRef } from 'react';

/**
 * Returns [ref, isVisible] where isVisible becomes true (and stays true)
 * once the sentinel element enters the viewport extended by `rootMargin`.
 *
 * Usage:
 *   const [ref, isVisible] = useSectionVisible('400px 0px');
 *   return <div ref={ref}>{isVisible ? <Real /> : <Skeleton />}</div>;
 */
export function useSectionVisible(rootMargin = '300px 0px') {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Once visible, never go back — disconnect observer
    if (isVisible) return;

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [isVisible, rootMargin]);

  return [ref, isVisible] as const;
}
