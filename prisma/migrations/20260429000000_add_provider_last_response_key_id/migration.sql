-- Привязываем Dialog.providerLastResponseId к конкретному API-ключу.
-- Если на следующем turn'е чата выбран другой ключ — chat-сервис дропает
-- previousResponseId и шлёт полную историю (response_id привязан к
-- организации/аккаунту OpenAI и невалиден в чужом ключе).
ALTER TABLE "dialogs" ADD COLUMN "providerLastResponseKeyId" TEXT;
