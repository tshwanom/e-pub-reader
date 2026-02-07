'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';

export default function HeroSection() {
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-fade-in');
          }
        });
      },
      { threshold: 0.1 }
    );

    if (heroRef.current) {
      const elements = heroRef.current.querySelectorAll('.fade-in-element');
      elements.forEach((el) => observer.observe(el));
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={heroRef}
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50/30 via-landing-bg to-blue-50/30 px-6 pt-20"
    >
      <div className="max-w-4xl mx-auto text-center space-y-8">
        {/* Main Heading */}
        <h1 className="fade-in-element font-playfair text-5xl md:text-6xl lg:text-7xl font-bold text-landing-text leading-tight">
          One Man. One Soul.
          <br />
          One Revolution.
        </h1>

        {/* Subtitle */}
        <p className="fade-in-element font-inter text-xl md:text-2xl text-landing-text max-w-2xl mx-auto leading-relaxed">
          A quiet rebellion against systems that dehumanize, silence, and
          fracture the human spirit.
        </p>

        {/* Manifesto */}
        <p className="fade-in-element font-crimson italic text-lg md:text-xl text-landing-text-muted max-w-xl mx-auto">
          This is not a movement you join.
          <br />
          It's a truth you remember.
        </p>

        {/* CTA */}
        <div className="fade-in-element pt-4">
          <Link
            href="#donate"
            className="inline-block px-8 py-4 bg-landing-accent text-white font-semibold rounded-lg hover:bg-landing-accent-secondary transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-landing-accent/30"
          >
            Support the Revolution
          </Link>
        </div>
      </div>
    </section>
  );
}
