#![no_std]

mod processor;
mod settlement;
mod state;

use pinocchio::{entrypoint, nostd_panic_handler};

entrypoint!(processor::process_instruction);
nostd_panic_handler!();
