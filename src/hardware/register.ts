export enum Register {
  R_R0,
  R_R1,
  R_R2,
  R_R3,
  R_R4,
  R_R5,
  R_R6,
  R_R7,
  R_PC /* program counter */,
  R_COND,
  R_COUNT,
}

export const registers = new Uint16Array(Register.R_COUNT);

export enum ConditionFlag {
  FL_POS = 1 << 0 /* P */,
  FL_ZRO = 1 << 1 /* Z */,
  FL_NEG = 1 << 2 /* N */,
}
