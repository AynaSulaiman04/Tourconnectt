export type ForgotPasswordFormState = {
  message: string;
  success: boolean;
  fieldErrors: {
    email?: string[];
  };
};

export const initialForgotPasswordFormState: ForgotPasswordFormState = {
  message: "",
  success: false,
  fieldErrors: {},
};
