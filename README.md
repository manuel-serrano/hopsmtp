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
HOPTRACE=hopsmtp:debug bin/hopsmtp -t < mail.example
```

and 

```shell
sh -x bin/hopsmtp -t < mail.example
```

To debug with gdb

```shell
gdb `which hop`
```

```gdb
(gdb) run --no-zeroconf --so-policy nte1 -q --no-server --so-dir /usr/local/lib/hopsmtp/0.4.2/so/hop/3.5.0/2b382a5d0fe4c645d55e512fa8c5cee4/linux-x86_64 -- /usr/local/lib/hopsmtp/0.4.2/hopsmtp.js -t < mail.example
```
  
or

```shell
gdb `which hop` -x gdb.cmd
```
