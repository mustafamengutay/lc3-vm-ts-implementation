import { readFileSync } from 'fs';
import { keyIn, keyInYN } from 'readline-sync';
import { ConditionFlag, Register, registers } from './hardware/register';
import { memory } from './hardware/memory';
import { OpCode } from './constants/opcodes';
import { Trap } from './constants/traps';
import { MemoryMappedRegister } from './constants/memory';

export class LC3VirtualMachine {
  private readonly PC_START = 0x3000;
  private readonly SIGN_BIT = 1 << 15;

  public run(): void {
    this.readImage('data/2048.obj');
    registers[Register.R_PC] = this.PC_START;

    let running = 1;
    while (running) {
      const instr: number = this.memRead(registers[Register.R_PC]);
      registers[Register.R_PC]++;
      const op: number = instr >> 12;

      switch (op) {
        case OpCode.OP_ADD: {
          this.add(instr);
          break;
        }
        case OpCode.OP_AND: {
          this.bitwiseAnd(instr);
          break;
        }
        case OpCode.OP_NOT: {
          this.bitwiseNot(instr);
          break;
        }
        case OpCode.OP_BR: {
          this.branch(instr);
          break;
        }
        case OpCode.OP_JMP: {
          this.jump(instr);
          break;
        }
        case OpCode.OP_JSR: {
          this.jumpRegister(instr);
          break;
        }
        case OpCode.OP_LD: {
          this.load(instr);
          break;
        }
        case OpCode.OP_LDI: {
          this.loadIndirect(instr);
          break;
        }
        case OpCode.OP_LDR: {
          this.loadRegister(instr);
          break;
        }
        case OpCode.OP_LEA: {
          this.loadEffectiveAddress(instr);
          break;
        }
        case OpCode.OP_ST: {
          this.store(instr);
          break;
        }
        case OpCode.OP_STI: {
          this.storeIndirect(instr);
          break;
        }
        case OpCode.OP_STR: {
          this.storeRegister(instr);
          break;
        }
        case OpCode.OP_TRAP: {
          this.handleTrap(instr, running);
          break;
        }
        case OpCode.OP_RES:
        case OpCode.OP_RTI:
        default: {
          this.abort();
        }
      }
    }
  }

  public signExtend(x: number, bitCount: number): number {
    const m = 1 << (bitCount - 1);
    x &= (1 << bitCount) - 1;
    return (x ^ m) - m;
  }

  public updateFlags(r: number) {
    if (registers[r] === 0) {
      registers[Register.R_COND] = ConditionFlag.FL_ZRO;
    } else if (registers[r] & this.SIGN_BIT) {
      /* a 1 in the left-most bit indicates negative */
      registers[Register.R_COND] = ConditionFlag.FL_NEG;
    } else {
      registers[Register.R_COND] = ConditionFlag.FL_POS;
    }
  }

  public add(instr: number) {
    /* destination register (DR) */
    const r0: number = (instr >> 9) & 0x7;
    /* first operand (SR1) */
    const r1: number = (instr >> 6) & 0x7;
    /* whether we are in immediate mode */
    const immFlag: number = (instr >> 5) & 0x1;

    if (immFlag) {
      const imm5: number = this.signExtend(instr & 0x1f, 5);
      registers[r0] = registers[r1] + imm5;
    } else {
      const r2: number = instr & 0x7;
      registers[r0] = registers[r1] + registers[r2];
    }

    this.updateFlags(r0);
  }

  public loadIndirect(instr: number) {
    /* destination register (DR) */
    const r0: number = (instr >> 9) & 0x7;
    /* PCoffset 9*/
    const pcOffset: number = this.signExtend(instr & 0x1ff, 9);

    /* add pc_offset to the current PC, look at that memory location to get the final address */
    registers[r0] = this.memRead(
      this.memRead(registers[Register.R_PC] + pcOffset)
    );

    this.updateFlags(r0);
  }

  public abort() {
    process.exit(-1);
  }

  public bitwiseAnd(instr: number) {
    const r0: number = (instr >> 9) & 0x7;
    const r1: number = (instr >> 6) & 0x7;
    const immFlag: number = (instr >> 5) & 0x1;

    if (immFlag) {
      const imm5: number = this.signExtend(instr & 0x1f, 5);
      registers[r0] = registers[r1] & imm5;
    } else {
      const r2: number = instr & 0x7;
      registers[r0] = registers[r1] & registers[r2];
    }

    this.updateFlags(r0);
  }

  public bitwiseNot(instr: number) {
    const r0: number = (instr >> 9) & 0x7;
    const r1: number = (instr >> 6) & 0x7;

    registers[r0] = ~registers[r1];

    this.updateFlags(r0);
  }

  public branch(instr: number) {
    const pcOffset: number = this.signExtend(instr & 0x1ff, 9);
    const condFlag: number = (instr >> 9) & 0x7;
    if (condFlag & registers[Register.R_COND]) {
      registers[Register.R_PC] += pcOffset;
    }
  }

  public jump(instr: number) {
    /* Also handles RET */
    const r1: number = (instr >> 6) & 0x7;
    registers[Register.R_PC] = registers[r1];
  }

  public jumpRegister(instr: number) {
    const r1: number = (instr >> 6) & 0x7;
    const longPCOffset: number = this.signExtend(instr & 0x7ff, 11);
    const longFlag: number = (instr >> 11) & 1;

    registers[Register.R_R7] = registers[Register.R_PC];
    if (longFlag) {
      registers[Register.R_PC] += longPCOffset; /* JSR */
    } else {
      registers[Register.R_PC] = registers[r1]; /* JSRR */
    }
  }

  public load(instr: number) {
    const r0: number = (instr >> 9) & 0x7;
    const pcOffset: number = this.signExtend(instr & 0x1ff, 9);
    registers[r0] = this.memRead(registers[Register.R_PC] + pcOffset);

    this.updateFlags(r0);
  }

  public loadRegister(instr: number) {
    const r0: number = (instr >> 9) & 0x7;
    const r1: number = (instr >> 6) & 0x7;
    const offset: number = this.signExtend(instr & 0x3f, 6);
    registers[r0] = this.memRead(registers[r1] + offset);

    this.updateFlags(r0);
  }

  public loadEffectiveAddress(instr: number) {
    const r0: number = (instr >> 9) & 0x7;
    const pcOffset: number = this.signExtend(instr & 0x1ff, 9);
    registers[r0] = registers[Register.R_PC] + pcOffset;

    this.updateFlags(r0);
  }

  public store(instr: number) {
    const r0: number = (instr >> 9) & 0x7;
    const pcOffset: number = this.signExtend(instr & 0x1ff, 9);
    this.memWrite(registers[Register.R_PC] + pcOffset, registers[r0]);
  }

  public storeIndirect(instr: number) {
    const r0: number = (instr >> 9) & 0x7;
    const pcOffset: number = this.signExtend(instr & 0x1ff, 9);
    this.memWrite(
      this.memRead(registers[Register.R_PC] + pcOffset),
      registers[r0]
    );
  }

  public storeRegister(instr: number) {
    const r0: number = (instr >> 9) & 0x7;
    const r1: number = (instr >> 6) & 0x7;
    const offset: number = this.signExtend(instr & 0x3f, 6);
    this.memWrite(registers[r1] + offset, registers[r0]);
  }

  public putBuf(data: number[]) {
    process.stdout.write(Buffer.from(data).toString('utf8'));
  }

  public handleTrap(instr: number, running: number) {
    switch (instr & 0xff) {
      case Trap.TRAP_GETC: {
        /* read a single ASCII char */
        registers[Register.R_R0] = this.getChar();
        break;
      }
      case Trap.TRAP_OUT: {
        this.putBuf([registers[Register.R_R0]]);
        break;
      }
      case Trap.TRAP_PUTS: {
        /* one char per word */
        let addr: number = registers[Register.R_R0];
        const buf = [];
        while (memory[addr] !== 0) {
          buf.push(memory[addr]);
          addr++;
        }
        this.putBuf(buf);
        break;
      }
      case Trap.TRAP_IN: {
        console.log('Enter a character: ');
        registers[Register.R_R0] = this.getChar();
        break;
      }
      case Trap.TRAP_PUTSP: {
        /* one char per byte (two bytes per word) here we need to swap back to
         big endian format */
        let addr: number = registers[Register.R_R0];
        const buf = [];

        while (memory[addr] !== 0) {
          const char1 = memory[addr] & 0xff;
          buf.push(char1);

          const char2 = memory[addr] >> 8;
          if (char2) {
            buf.push(char2);
          }
          addr++;
        }
        this.putBuf(buf);
        break;
      }
      case Trap.TRAP_HALT: {
        console.log('HALT');
        running = 0;
      }
    }
  }

  public getChar(): number {
    const input = keyIn('').trim();
    if (input.toLowerCase() === 'q') {
      if (keyInYN('Would you like to quit?')) {
        process.exit(0);
      }
    }
    return input.charCodeAt(0);
  }

  public memWrite(address: number, val: number) {
    memory[address] = val;
  }

  public memRead(address: number): number {
    if (address === MemoryMappedRegister.MR_KBSR) {
      const input = this.getChar();
      if (input) {
        memory[MemoryMappedRegister.MR_KBSR] = 1 << 15;
        memory[MemoryMappedRegister.MR_KBDR] = input;
      } else {
        memory[MemoryMappedRegister.MR_KBSR] = 0x00;
      }
    }
    return memory[address];
  }

  public readImage(imagePath: string) {
    const image = readFileSync(imagePath);
    /* the origin tells us where in memory to place the image */

    const origin: number = image.readUInt16BE(0);
    let pos = 0;

    while ((pos + 1) * 2 < image.length) {
      memory[origin + pos] = image.readUInt16BE((pos + 1) * 2);
      pos++;
    }
  }
}
