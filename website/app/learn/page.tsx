import Link from "next/link";
import { LESSONS } from "@/lib/lessons";

export const metadata = {
  title: "Learn | ConditionCover",
};

export default function LearnPage() {
  return (
    <main className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Learn</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Six lessons covering space weather risk, the ConditionCover platform, and advanced strategies.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {LESSONS.map((lesson) => {
          const available = lesson.video !== null;
          return (
            <Link
              key={lesson.slug}
              href={`/learn/${lesson.slug}`}
              className="group rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-md transition-all flex flex-col"
            >
              {/* Card header stripe */}
              <div className="rounded-t-xl bg-gray-200 dark:bg-gray-800 px-4 py-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Lesson {lesson.number}
                </span>
                <span
                  className={
                    available
                      ? "text-xs font-medium text-green-600 dark:text-green-400"
                      : "text-xs font-medium text-muted-foreground"
                  }
                >
                  {available ? "Available" : "Coming Soon"}
                </span>
              </div>

              {/* Card body */}
              <div className="px-5 py-4 flex flex-col flex-1 gap-3">
                <h2 className="text-sm font-semibold leading-snug group-hover:text-primary transition-colors">
                  {lesson.title}
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                  {lesson.blurb}
                </p>
                <div className="flex items-center justify-between pt-1">
                  {lesson.duration ? (
                    <span className="text-xs text-muted-foreground">{lesson.duration}</span>
                  ) : (
                    <span />
                  )}
                  <span className="text-xs font-medium text-primary group-hover:underline">
                    {available ? "Start lesson →" : "Preview →"}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
