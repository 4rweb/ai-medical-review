export interface PatientDetails {
  name: string;
  age: number;
  sex: 'male' | 'female' | '';
}

export interface SymptomInput {
  text: string;
  audioLogged: boolean;
}

export interface AdaptiveQuestion {
  id: string;
  text: string;
  type: 'yes_no' | 'single_choice';
  options?: string[];
}

export interface AdaptiveAnswer {
  questionId: string;
  questionText: string;
  answer: string;
}

export interface PainLevel {
  score: number;
  label: string;
}

export interface Vitals {
  temperature?: string;
  heartRate?: string;
  bloodPressure?: string;
  saturation?: string;
}

export type ManchesterColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue';

export interface TriageResult {
  color: ManchesterColor;
  title: string;
  explanation: string;
  waitingTime: string;
  recommendations: string[];
}
