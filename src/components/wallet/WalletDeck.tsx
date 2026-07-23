/**
 * WalletDeck - the Google-Wallet-style stacked card deck, ported 1:1 from the
 * carousel in nexus-wallet's WalletPage (the `deckCards.map` block: pose math,
 * spring transition, side-peek, brightness dim, and the fixed y:-50% vertical
 * centring). Made presentational for the website hero: it takes a card list +
 * active index and renders the poses; the drag/reorder/tap wiring from the real
 * wallet is dropped (the hero auto-plays), so it never navigates.
 *
 * The active card sits crisp + centred (scale 0.9); its neighbour peeks solid
 * but dimmed on one side (left in RTL, right in LTR); anything further is
 * scaled down and faded out. Changing `activeIndex` springs the deck across.
 */
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export interface DeckCard {
  id: string;
  node: ReactNode;
}

interface WalletDeckProps {
  cards: DeckCard[];
  activeIndex: number;
  isRTL: boolean;
  /** Natural (unscaled) card height in px; the deck reserves 0.9x of it. */
  deckHeight: number;
  reduce: boolean | null;
}

export default function WalletDeck({ cards, activeIndex, isRTL, deckHeight, reduce }: WalletDeckProps) {
  return (
    <div className="relative" style={{ height: deckHeight ? deckHeight * 0.9 : undefined }}>
      {cards.map((card, i) => {
        const rel = i - activeIndex;
        const isCenter = rel === 0;
        const isNeighbour = Math.abs(rel) === 1;
        // The next card (rel > 0) sits on the left in RTL / right in LTR; the
        // previous card (rel < 0) is mirrored.
        const side = isCenter ? 0 : rel > 0 ? (isRTL ? -1 : 1) : isRTL ? 1 : -1;
        // y (vertical centring) is a CONSTANT style below - never part of the
        // animated pose - so framer can't reset it on re-render and drop the card.
        const pose = isCenter
          ? { x: '0%', scale: 0.9, opacity: 1 }
          : isNeighbour
            ? { x: `${side * 16}%`, scale: 0.74, opacity: 1 }
            : { x: `${side * 40}%`, scale: 0.6, opacity: 0 };
        return (
          <motion.div
            key={card.id}
            aria-hidden={!isCenter}
            className="absolute inset-x-0 top-1/2 select-none"
            style={{
              y: '-50%',
              transformOrigin: 'center center',
              zIndex: isCenter ? 30 : 10,
              filter: isCenter ? 'none' : 'brightness(0.78)',
              pointerEvents: 'none',
            }}
            initial={false}
            animate={pose}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 32 }}
          >
            <div className="w-full">{card.node}</div>
          </motion.div>
        );
      })}
    </div>
  );
}
