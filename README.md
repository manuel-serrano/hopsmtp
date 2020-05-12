Edit the file hopsmtp.json then copy it into

```shell
$HOME/.config/hop/hopsmtp/hopsmtp.json
```

To test:

```shell
bin/hopsmtp -t < mail.example
```

To debug if something goes wrong with compiled files:

```shell
sh -x bin/hopsmtp -t < mail.example
```

To debug with gdb

```shell
gdb `which hop`
```

```gdb
(gdb) run --no-zeroconf --so-policy nte1 -q --no-server --so-dir /usr/local/lib/hopsmtp/0.2.1/so/hop/3.3.0/6c3b8c5f87009dc7ebfbfe534acb1c65/linux-x86_64 -- /usr/local/lib/hopsmtp/0.2.1/hopsmtp.js -t < mail.example
```
  
or

```shell
gdb `which hop` -x gdb.cmd
```
