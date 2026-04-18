-- CreateTable
CREATE TABLE "pet_personas" (
    "id" SERIAL NOT NULL,
    "pet_id" INTEGER NOT NULL,
    "owner_speech_style" TEXT,
    "owner_interests" TEXT,
    "owner_expressions" TEXT,
    "owner_tone" VARCHAR(50),
    "owner_language" VARCHAR(20),
    "owner_bio" TEXT,
    "analyzed_patterns" JSONB,
    "sample_messages" JSONB,
    "vocabulary_style" TEXT,
    "observed_topics" JSONB,
    "observed_style" JSONB,
    "last_observed_at" TIMESTAMP(3),
    "persona_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_personas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pet_personas_pet_id_key" ON "pet_personas"("pet_id");

-- AddForeignKey
ALTER TABLE "pet_personas" ADD CONSTRAINT "pet_personas_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
