export interface ISendChatMessagePayload {
	message: string;
	sessionId?: string;
}

export interface IChatTechnician {
	id: string;
	name: string;
	skills: string[];
	areas: string[];
	experienceYears: number;
	ratingAvg: number;
	ratingCount: number;
	isAvailableNow: boolean;
	rateMin: number | null;
	rateMax: number | null;
}

export interface IChatResponse {
	sessionId: string;
	answer: string;
	technicians: IChatTechnician[];
}
