use clap::{Command, Arg};

fn main() {
    let matches = Command::new("mycli")
        .subcommand(
            Command::new("create")
                .about("Create a new item")
                .arg(Arg::new("name").long("name").help("Item name").required(false))
                .arg(Arg::new("verbose").long("verbose").help("Verbose output").action(clap::ArgAction::SetTrue))
        )
        .subcommand(
            Command::new("delete")
                .about("Delete an item")
                .arg(Arg::new("id").long("id").help("Item ID").required(true))
        )
        .get_matches();
}
