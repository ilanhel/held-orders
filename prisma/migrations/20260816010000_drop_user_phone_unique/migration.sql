-- Allow several users (and branches) to share the same phone: the phone is
-- used only for WhatsApp notifications, not for login (login is by loginCode).
DROP INDEX "User_phone_key";
