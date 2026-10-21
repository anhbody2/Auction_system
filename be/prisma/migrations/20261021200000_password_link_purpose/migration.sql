-- mail-003: change-password links share the reset-token table; purpose tells them apart.
ALTER TABLE "password_reset_tokens" ADD COLUMN "purpose" VARCHAR(20) NOT NULL DEFAULT 'reset';
