"use client";

// Every past question, searchable and filterable. Reads entirely from the
// cached bundle, so it works with no connection.

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { labelDay } from "@/lib/day";
import { categoryLabel, type DayView } from "@/lib/questions";
import { EmptyState, IconButton, Input, SegmentedControl } from "@/components/ui";
import { HeartIcon } from "@/components/hearts";
import { AnswerPair } from "./answer-pair";

type Filter = "all" | "answered" | "missed" | "favorites";

export function QuestionHistory({
  items,
  favorites,
  onToggleFavorite,
  myName,
  partnerName,
  timezone,
}: {
  items: DayView[];
  favorites: Set<string>;
  onToggleFavorite: (questionId: string) => void;
  myName: string;
  partnerName: string;
  timezone: string;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [category, setCategory] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const categories = useMemo(() => {
    const found = new Set<string>();
    for (const item of items) if (item.question) found.add(item.question.category);
    return ["all", ...Array.from(found).sort()];
  }, [items]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      if (!item.question) return false;
      if (category !== "all" && item.question.category !== category) return false;
      if (filter === "answered" && !(item.mine && item.theirs)) return false;
      if (filter === "missed" && item.mine) return false;
      if (filter === "favorites" && !favorites.has(item.question.id)) return false;
      if (!needle) return true;
      const haystack = [
        item.question.prompt,
        item.question.category,
        item.mine?.answer,
        item.theirs?.answer,
        item.mine?.guess,
        item.theirs?.guess,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [items, search, filter, category, favorites]);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-semibold text-plum">Past questions</h2>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-berry-soft" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search questions and answers"
          aria-label="Search question history"
          className="pl-10"
        />
      </div>

      <SegmentedControl<Filter>
        label="Filter history"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All" },
          { value: "answered", label: "Both answered" },
          { value: "missed", label: "Missed" },
          { value: "favorites", label: "Favorites" },
        ]}
      />

      {categories.length > 2 && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {categories.map((option) => (
            <button
              key={option}
              onClick={() => setCategory(option)}
              className={`pressable shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                category === option
                  ? "border-plum bg-plum text-white"
                  : "border-line bg-white text-berry-soft"
              }`}
            >
              {option === "all" ? "Every category" : categoryLabel(option)}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title={items.length === 0 ? "No past questions yet" : "Nothing matches that"}
          hint={
            items.length === 0
              ? "Your first answered question will show up here tomorrow."
              : "Try a different search or filter."
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((item) => {
            const question = item.question!;
            const open = expanded === item.dq.id;
            const isFavorite = favorites.has(question.id);
            return (
              <li key={item.dq.id} className="rounded-card border border-line bg-white shadow-soft">
                <div className="flex items-start gap-1 p-3.5">
                  <button
                    onClick={() => setExpanded(open ? null : item.dq.id)}
                    aria-expanded={open}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-berry-soft">
                      <span>{labelDay(timezone, item.dq.for_date)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{categoryLabel(question.category)}</span>
                      {!item.mine && (
                        <span className="rounded-full bg-cream px-2 py-0.5 font-semibold">Missed</span>
                      )}
                    </p>
                    <p className={`mt-0.5 font-semibold text-berry ${open ? "" : "clamp-2"}`}>
                      {question.prompt}
                    </p>
                  </button>
                  <IconButton
                    label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                    onClick={() => onToggleFavorite(question.id)}
                    className={`h-9 w-9 ${isFavorite ? "text-rose-deep" : ""}`}
                  >
                    <HeartIcon className="h-4 w-4" filled={isFavorite} />
                  </IconButton>
                </div>

                {open && (
                  <div className="border-t border-line-soft p-3.5">
                    {item.mine || item.theirs ? (
                      <AnswerPair
                        question={question}
                        myAnswer={item.mine}
                        partnerAnswer={item.theirs}
                        myName={myName}
                        partnerName={partnerName}
                      />
                    ) : (
                      <p className="text-sm text-berry-soft">
                        Neither of you answered this one. It happens.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
