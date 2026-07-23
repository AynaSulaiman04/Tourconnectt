export type SignupFormState = {
  message: string;
  success: boolean;
  fieldErrors: {
    fullName?: string[];
    email?: string[];
    password?: string[];
  };
};

export const initialSignupFormState: SignupFormState = {
  message: "",
  success: false,
  fieldErrors: {},
};
