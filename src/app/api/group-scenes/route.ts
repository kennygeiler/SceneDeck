import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db, schema } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SceneGroup = {
  title: string;
  description: string;
  location: string;
  interiorExterior: string;
  timeOfDay: string;
  shotIds: string[];
};

type GroupScenesRequest = {
  filmId: string;
  scenes: SceneGroup[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GroupScenesRequest;

    if (!body.filmId || typeof body.filmId !== "string") {
      return NextResponse.json(
        { error: "filmId is required." },
        { status: 400 },
      );
    }

    if (!Array.isArray(body.scenes) || body.scenes.length === 0) {
      return NextResponse.json(
        { error: "scenes array is required and must not be empty." },
        { status: 400 },
      );
    }

    // Verify film exists
    const [film] = await db
      .select({ id: schema.films.id })
      .from(schema.films)
      .where(eq(schema.films.id, body.filmId))
      .limit(1);

    if (!film) {
      return NextResponse.json(
        { error: "Film not found." },
        { status: 404 },
      );
    }

    // Delete existing scenes for this film (re-grouping)
    await db
      .delete(schema.scenes)
      .where(eq(schema.scenes.filmId, body.filmId));

    // Reset sceneId on all shots for this film
    await db
      .update(schema.shots)
      .set({ sceneId: null })
      .where(eq(schema.shots.filmId, body.filmId));

    let createdScenes = 0;
    let linkedShots = 0;

    for (let i = 0; i < body.scenes.length; i++) {
      const group = body.scenes[i];

      if (!Array.isArray(group.shotIds) || group.shotIds.length === 0) {
        continue;
      }

      const [insertedScene] = await db
        .insert(schema.scenes)
        .values({
          filmId: body.filmId,
          sceneNumber: i + 1,
          title: group.title || null,
          description: group.description || null,
          location: group.location || null,
          interiorExterior: group.interiorExterior || null,
          timeOfDay: group.timeOfDay || null,
        })
        .returning({ id: schema.scenes.id });

      // Link shots to the scene
      for (const shotId of group.shotIds) {
        await db
          .update(schema.shots)
          .set({ sceneId: insertedScene.id })
          .where(eq(schema.shots.id, shotId));
        linkedShots++;
      }

      // Update scene timecodes from linked shots
      const linkedShotData = await db
        .select({
          startTc: schema.shots.startTc,
          endTc: schema.shots.endTc,
        })
        .from(schema.shots)
        .where(eq(schema.shots.sceneId, insertedScene.id));

      if (linkedShotData.length > 0) {
        const starts = linkedShotData
          .map((s) => s.startTc)
          .filter((v): v is number => v !== null);
        const ends = linkedShotData
          .map((s) => s.endTc)
          .filter((v): v is number => v !== null);

        if (starts.length > 0 && ends.length > 0) {
          const startTc = Math.min(...starts);
          const endTc = Math.max(...ends);
          await db
            .update(schema.scenes)
            .set({
              startTc,
              endTc,
              totalDuration: endTc - startTc,
            })
            .where(eq(schema.scenes.id, insertedScene.id));
        }
      }

      createdScenes++;
    }

    return NextResponse.json({
      success: true,
      filmId: body.filmId,
      scenesCreated: createdScenes,
      shotsLinked: linkedShots,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Scene grouping failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
