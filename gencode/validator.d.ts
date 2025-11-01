import type { Config } from "./type";
export const validate: {
	(input: any): input is Config;
	errors: any;
};
