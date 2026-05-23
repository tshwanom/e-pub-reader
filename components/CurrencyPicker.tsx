'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import {
  POPULAR_DONATION_CURRENCIES,
  type DonationCurrencyOption,
} from '@/lib/donations';

interface CurrencyPickerProps {
  id: string;
  value: string;
  detectedCurrency: string;
  options: DonationCurrencyOption[];
  onChange: (currency: string) => void;
  onUseDetectedCurrency?: () => void;
}

function getOptionSearchTerms(option: DonationCurrencyOption) {
  return [option.code, option.name, ...option.territories].map((value) => value.toLowerCase());
}

type RankedCurrencyOption = DonationCurrencyOption & {
  matchRank: number;
  pinRank: number;
};

export default function CurrencyPicker({
  id,
  value,
  detectedCurrency,
  options,
  onChange,
  onUseDetectedCurrency,
}: CurrencyPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeOptionCode, setActiveOptionCode] = useState<string | null>(value);

  const selectedOption = options.find((option) => option.code === value) ?? null;
  const detectedOption = options.find((option) => option.code === detectedCurrency) ?? null;
  const selectedTerritory = selectedOption?.territories[0] ?? null;
  const detectedTerritory = detectedOption?.territories[0] ?? null;
  const normalizedQuery = query.trim().toLowerCase();
  const activeOptionId = activeOptionCode ? `${id}-option-${activeOptionCode}` : undefined;

  const filteredOptions = useMemo<RankedCurrencyOption[]>(() => {
    return options
      .reduce<RankedCurrencyOption[]>((matches, option) => {
        const searchTerms = getOptionSearchTerms(option);
        const matchesQuery = normalizedQuery.length === 0
          || searchTerms.some((term) => term.includes(normalizedQuery));

        if (!matchesQuery) {
          return matches;
        }

        let matchRank = 2;

        if (normalizedQuery.length > 0) {
          if (option.code.toLowerCase() === normalizedQuery) {
            matchRank = 0;
          } else if (searchTerms.some((term) => term.startsWith(normalizedQuery))) {
            matchRank = 1;
          }
        }

        const pinRank = option.code === value
          ? -2
          : option.code === detectedCurrency
            ? -1
            : 0;

        matches.push({
          ...option,
          matchRank,
          pinRank,
        });

        return matches;
      }, [])
      .sort((left, right) => (
        left.matchRank - right.matchRank
        || left.pinRank - right.pinRank
        || left.code.localeCompare(right.code)
      ));
  }, [detectedCurrency, normalizedQuery, options, value]);

  const popularCurrencySet = useMemo(
    () => new Set<string>(POPULAR_DONATION_CURRENCIES),
    []
  );

  const popularOptions = useMemo(
    () => filteredOptions.filter((option) => popularCurrencySet.has(option.code)),
    [filteredOptions, popularCurrencySet]
  );

  const remainingOptions = useMemo(
    () => filteredOptions.filter((option) => !popularCurrencySet.has(option.code)),
    [filteredOptions, popularCurrencySet]
  );

  const visibleOptionCodes = useMemo(
    () => [...popularOptions, ...remainingOptions].map((option) => option.code),
    [popularOptions, remainingOptions]
  );

  const pickerSections = useMemo(() => {
    const sections: Array<{ title: string; options: RankedCurrencyOption[] }> = [];

    if (popularOptions.length > 0) {
      sections.push({
        title: 'Popular currencies',
        options: popularOptions,
      });
    }

    if (remainingOptions.length > 0) {
      sections.push({
        title: normalizedQuery.length > 0 && popularOptions.length > 0 ? 'All matches' : 'All currencies',
        options: remainingOptions,
      });
    }

    return sections;
  }, [normalizedQuery.length, popularOptions, remainingOptions]);

  const selectOption = (currencyCode: string) => {
    onChange(currencyCode);
    setActiveOptionCode(currencyCode);
    setIsOpen(false);
  };

  const moveActiveOption = (direction: 1 | -1 | 'home' | 'end') => {
    if (visibleOptionCodes.length === 0) {
      return;
    }

    setActiveOptionCode((currentCode) => {
      if (direction === 'home') {
        return visibleOptionCodes[0];
      }

      if (direction === 'end') {
        return visibleOptionCodes[visibleOptionCodes.length - 1];
      }

      const currentIndex = currentCode ? visibleOptionCodes.indexOf(currentCode) : -1;

      if (currentIndex === -1) {
        return direction === 1
          ? visibleOptionCodes[0]
          : visibleOptionCodes[visibleOptionCodes.length - 1];
      }

      return visibleOptionCodes[
        (currentIndex + direction + visibleOptionCodes.length) % visibleOptionCodes.length
      ];
    });
  };

  const openPicker = (preferredActiveCode?: string) => {
    setIsOpen(true);
    setActiveOptionCode(preferredActiveCode ?? value);
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        openPicker(visibleOptionCodes[0] ?? value);
        break;
      case 'ArrowUp':
        event.preventDefault();
        openPicker(visibleOptionCodes[visibleOptionCodes.length - 1] ?? value);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        openPicker(activeOptionCode ?? value);
        break;
      default:
        break;
    }
  };

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveActiveOption(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveActiveOption(-1);
        break;
      case 'Home':
        event.preventDefault();
        moveActiveOption('home');
        break;
      case 'End':
        event.preventDefault();
        moveActiveOption('end');
        break;
      case 'Enter':
        if (activeOptionCode) {
          event.preventDefault();
          selectOption(activeOptionCode);
        }
        break;
      case 'Tab':
        setIsOpen(false);
        break;
      default:
        break;
    }
  };

  const handleOptionKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveActiveOption(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveActiveOption(-1);
        break;
      case 'Home':
        event.preventDefault();
        moveActiveOption('home');
        break;
      case 'End':
        event.preventDefault();
        moveActiveOption('end');
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setActiveOptionCode(value);
      return;
    }

    searchInputRef.current?.focus();
  }, [isOpen, value]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setActiveOptionCode((currentCode) => {
      if (currentCode && visibleOptionCodes.includes(currentCode)) {
        return currentCode;
      }

      return visibleOptionCodes[0] ?? null;
    });
  }, [isOpen, visibleOptionCodes]);

  useEffect(() => {
    if (!isOpen || !activeOptionCode) {
      return;
    }

    const activeOptionNode = optionRefs.current[activeOptionCode];

    if (typeof activeOptionNode?.scrollIntoView === 'function') {
      activeOptionNode.scrollIntoView({ block: 'nearest' });
    }
  }, [activeOptionCode, isOpen]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={isOpen ? `${id}-listbox` : undefined}
        onClick={() => setIsOpen((open) => !open)}
        onKeyDown={handleTriggerKeyDown}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-landing-border bg-white px-4 py-3 text-left shadow-sm transition-all duration-200 hover:border-landing-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-landing-surface-muted text-base">
            {selectedOption?.flag ?? '💱'}
          </span>

          <div className="min-w-0">
            <span className="block truncate text-sm font-semibold text-landing-text">
              {selectedOption ? `${selectedOption.code} · ${selectedOption.name}` : value}
            </span>
            <span className="mt-0.5 block truncate text-xs text-landing-text-muted">
              {selectedTerritory ?? 'Search country or currency'}
            </span>
          </div>
        </div>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-landing-text-muted transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Select currency"
            className="w-full max-w-md overflow-hidden rounded-2xl border border-landing-border bg-white shadow-2xl flex flex-col max-h-[85vh] animate-in fade-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200"
          >
            <div className="border-b border-landing-border/80 p-3 shrink-0">
            <div className="flex items-center gap-2 rounded-xl border border-landing-border bg-white px-3 py-2 shadow-sm">
              <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-landing-text-muted" />
              <input
                ref={searchInputRef}
                type="text"
                role="combobox"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search country or currency"
                aria-label="Search currencies"
                aria-expanded={isOpen}
                aria-controls={`${id}-listbox`}
                aria-activedescendant={activeOptionId}
                aria-autocomplete="list"
                className="w-full border-0 bg-transparent p-0 text-sm text-landing-text placeholder:text-landing-text-muted focus:outline-none focus:ring-0"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="rounded-full p-1 text-landing-text-muted transition-colors hover:bg-landing-surface-muted hover:text-landing-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2"
                  aria-label="Clear currency search"
                >
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            {detectedOption ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-landing-text-muted">
                <span className="rounded-full bg-landing-surface-muted px-3 py-1">
                  {detectedOption.flag} Detected {detectedOption.code}{detectedTerritory ? ` · ${detectedTerritory}` : ''}
                </span>
                {value !== detectedCurrency && onUseDetectedCurrency ? (
                  <button
                    type="button"
                    onClick={() => {
                      onUseDetectedCurrency();
                      setIsOpen(false);
                    }}
                    className="rounded-full border border-landing-border bg-white px-3 py-1 font-medium text-landing-text transition-colors hover:border-landing-accent/40 hover:text-landing-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2"
                  >
                    Use detected currency
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div
            id={`${id}-listbox`}
            role="listbox"
            aria-labelledby={id}
            className="max-h-[60vh] space-y-1 overflow-y-auto p-2"
          >
            {filteredOptions.length > 0 ? (
              pickerSections.map((section) => (
                <div key={section.title} className="space-y-1.5">
                  <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-landing-text-muted">
                    {section.title}
                  </p>

                  {section.options.map((option) => {
                    const isSelected = option.code === value;
                    const isDetected = option.code === detectedCurrency;
                    const isActive = option.code === activeOptionCode;
                    const territorySummary = option.territories.length > 0
                      ? option.territories.slice(0, 3).join(', ')
                      : 'Global support';

                    return (
                      <button
                        key={option.code}
                        id={`${id}-option-${option.code}`}
                        ref={(node) => {
                          optionRefs.current[option.code] = node;
                        }}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => selectOption(option.code)}
                        onFocus={() => setActiveOptionCode(option.code)}
                        onMouseMove={() => setActiveOptionCode(option.code)}
                        onKeyDown={handleOptionKeyDown}
                        className={`flex w-full items-start justify-between gap-3 rounded-xl px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:ring-offset-2 ${
                          isSelected
                            ? 'bg-landing-accent/8 text-landing-text'
                            : isActive
                              ? 'bg-landing-surface-muted text-landing-text'
                              : 'text-landing-text hover:bg-landing-surface-muted'
                        }`}
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-landing-surface-muted text-sm">
                            {option.flag}
                          </span>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-landing-text">{option.code}</span>
                              <span className="text-sm text-landing-text-muted">{option.name}</span>
                            </div>
                            <p className="mt-1 truncate text-xs text-landing-text-muted">{territorySummary}</p>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {isDetected ? (
                            <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-landing-text-muted">
                              Detected
                            </span>
                          ) : null}
                          {isSelected ? <Check aria-hidden="true" className="h-4 w-4 text-landing-accent" /> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))
            ) : (
              <div className="px-3 py-5 text-center text-sm text-landing-text-muted">
                No currencies matched “{query.trim()}”. Try a country, code, or currency name.
              </div>
            )}
          </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}