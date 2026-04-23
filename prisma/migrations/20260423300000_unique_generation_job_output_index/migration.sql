-- Дедупликация на случай если в БД уже накопились дубликаты outputs (по race-condition'ам до фикса).
-- Оставляем самую раннюю запись для каждой пары (jobId, index), остальные удаляем.
DELETE FROM "generation_job_outputs"
WHERE "id" NOT IN (
  SELECT MIN("id")
  FROM "generation_job_outputs"
  GROUP BY "jobId", "index"
);

-- CreateIndex
CREATE UNIQUE INDEX "generation_job_outputs_jobId_index_key" ON "generation_job_outputs"("jobId", "index");
