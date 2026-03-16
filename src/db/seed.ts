import { db, schema } from "./index";

async function main() {
  const insertedFilms = await db
    .insert(schema.films)
    .values([
      {
        title: "2001: A Space Odyssey",
        director: "Stanley Kubrick",
        year: 1968,
      },
      {
        title: "Whiplash",
        director: "Damien Chazelle",
        year: 2014,
      },
      {
        title: "The Shining",
        director: "Stanley Kubrick",
        year: 1980,
      },
    ])
    .returning({
      id: schema.films.id,
      title: schema.films.title,
    });

  const filmIds = Object.fromEntries(
    insertedFilms.map((film) => [film.title, film.id]),
  );

  const insertedShots = await db
    .insert(schema.shots)
    .values([
      {
        filmId: filmIds["2001: A Space Odyssey"],
        duration: 45.0,
        videoUrl: null,
        thumbnailUrl: null,
      },
      {
        filmId: filmIds.Whiplash,
        duration: 1.5,
        videoUrl: null,
        thumbnailUrl: null,
      },
      {
        filmId: filmIds["The Shining"],
        duration: 62.0,
        videoUrl: null,
        thumbnailUrl: null,
      },
    ])
    .returning({
      id: schema.shots.id,
      filmId: schema.shots.filmId,
      duration: schema.shots.duration,
    });

  await db.insert(schema.shotMetadata).values([
    {
      shotId: insertedShots[0].id,
      movementType: "dolly",
      direction: "in",
      speed: "slow",
      shotSize: "wide",
      angleVertical: "eye_level",
      angleHorizontal: "frontal",
      durationCat: "long_take",
      isCompound: false,
    },
    {
      shotId: insertedShots[1].id,
      movementType: "whip_pan",
      direction: "right",
      speed: "snap",
      shotSize: "close",
      angleVertical: "eye_level",
      angleHorizontal: "three_quarter",
      durationCat: "flash",
      isCompound: false,
    },
    {
      shotId: insertedShots[2].id,
      movementType: "steadicam",
      direction: "forward",
      speed: "moderate",
      shotSize: "medium_wide",
      angleVertical: "low_angle",
      angleHorizontal: "rear",
      durationCat: "long_take",
      isCompound: true,
      compoundParts: [
        { type: "steadicam", direction: "forward" },
        { type: "pan", direction: "right" },
      ],
    },
  ]);

  console.log(`Inserted ${insertedFilms.length} films`);
  console.log(`Inserted ${insertedShots.length} shots`);
  console.table(
    insertedFilms.map((film) => ({
      type: "film",
      title: film.title,
      id: film.id,
    })),
  );
  console.table(
    insertedShots.map((shot, index) => ({
      type: "shot",
      order: index + 1,
      id: shot.id,
      filmId: shot.filmId,
      duration: shot.duration,
    })),
  );
}

main().catch((error) => {
  console.error("Seeding failed.");
  console.error(error);
  process.exit(1);
});
