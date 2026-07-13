declare module "highs" {
  export interface HighsColumnSolution {
    Primal: number;
    Dual?: number;
    Name?: string;
  }
  export interface HighsSolution {
    Status: string;
    ObjectiveValue?: number;
    Columns: Record<string, HighsColumnSolution>;
    Rows: unknown[];
  }
  export interface HighsInstance {
    solve(problem: string, options?: Record<string, unknown>): HighsSolution;
  }
  export interface HighsLoaderOptions {
    locateFile?: (file: string) => string;
  }
  export default function loadHighs(options?: HighsLoaderOptions): Promise<HighsInstance>;
}
