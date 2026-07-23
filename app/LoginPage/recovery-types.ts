export type RecoveryFormState = {
  message: string;
  success: boolean;
  fieldErrors: {
    password?: string[];
    confirmPassword?: string[];
  };
};

export const initialRecoveryFormState: RecoveryFormState = {
  message: "",
  success: false,
  fieldErrors: {},
};
