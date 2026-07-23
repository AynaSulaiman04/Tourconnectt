export type LoginFormState = {
  message: string;
  success: boolean;
  fieldErrors: {
    email?: string[];
    password?: string[];
  };
};

export const initialLoginFormState: LoginFormState = {
  message: "",
  success: false,
  fieldErrors: {},
};
