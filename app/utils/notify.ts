import { notifications } from "@mantine/notifications";

export const notifySuccess = (message: string, title = "完了") => {
  notifications.show({
    title,
    message,
    color: "green",
  });
};

export const notifyError = (message: string, title = "エラー") => {
  notifications.show({
    title,
    message,
    color: "red",
  });
};

export const notifyInfo = (message: string, title = "お知らせ") => {
  notifications.show({
    title,
    message,
    color: "blue",
  });
};

export const toErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;
