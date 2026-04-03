import Link from "next/link";
import { notFound } from "next/navigation";
import { getLessonBySlug, LESSONS } from "@/lib/lessons";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return LESSONS.map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const lesson = getLessonBySlug(slug);
  if (!lesson) return {};
  return { title: `${lesson.title} | ConditionCover Learn` };
}

export default async function LessonPage({ params }: Props) {
  const { slug } = await params;
  const lesson = getLessonBySlug(slug);
  if (!lesson) notFound();

  const prevLesson = LESSONS[lesson.number - 2] ?? null; // number is 1-based
  const nextLesson = LESSONS[lesson.number] ?? null;

  return (
    <main className="mx-auto max-w-4xl w-full px-4 sm:px-6 lg:px-8 py-8">

      {/* Back link */}
      <Link
        href="/learn"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        ← Back to Learn
      </Link>

      {/* Lesson header */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          Lesson {lesson.number}
        </p>
        <h1 className="text-2xl font-semibold">{lesson.title}</h1>
        {lesson.duration && (
          <p className="text-sm text-muted-foreground mt-1">{lesson.duration}</p>
        )}
      </div>

      {/* Video area */}
      <div className="mb-8 rounded-xl overflow-hidden border border-border bg-black">
        {lesson.video?.type === "youtube" ? (
          <iframe
            src={`https://www.youtube.com/embed/${lesson.video.id}`}
            title={lesson.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="w-full aspect-video"
          />
        ) : lesson.video?.type === "upload" ? (
          <video
            src={lesson.video.file}
            controls
            controlsList="nodownload"
            className="w-full aspect-video"
          />
        ) : (
          <div className="w-full aspect-video flex items-center justify-center bg-gray-900">
            <p className="text-sm text-gray-400">Video coming soon</p>
          </div>
        )}
      </div>

      {/* Lesson description */}
      <div className="prose prose-sm dark:prose-invert max-w-none mb-10">
        <p className="text-sm leading-relaxed text-foreground">{lesson.description}</p>
      </div>

      {/* Prev / Next navigation */}
      <div className="border-t border-border pt-6 flex items-center justify-between gap-4">
        {prevLesson ? (
          <Link
            href={`/learn/${prevLesson.slug}`}
            className="flex flex-col items-start group"
          >
            <span className="text-xs text-muted-foreground mb-0.5">← Previous</span>
            <span className="text-sm font-medium group-hover:text-primary transition-colors">
              Lesson {prevLesson.number}: {prevLesson.title}
            </span>
          </Link>
        ) : (
          <div />
        )}

        {nextLesson ? (
          <Link
            href={`/learn/${nextLesson.slug}`}
            className="flex flex-col items-end group"
          >
            <span className="text-xs text-muted-foreground mb-0.5">Next →</span>
            <span className="text-sm font-medium group-hover:text-primary transition-colors">
              Lesson {nextLesson.number}: {nextLesson.title}
            </span>
          </Link>
        ) : (
          <div />
        )}
      </div>
    </main>
  );
}
