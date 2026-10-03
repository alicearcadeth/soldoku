#![no_std]

mod processor;
mod state;

use pinocchio::{entrypoint, nostd_panic_handler};
entrypoint!(processor::process_instruction);
nostd_panic_handler!();
